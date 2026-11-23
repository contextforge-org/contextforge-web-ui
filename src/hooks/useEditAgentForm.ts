import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { useAuth } from "@/auth/useAuth";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import {
  hasRequiredCredentials,
  type AgentAuthType,
  type AgentAuthValues,
  type ProtocolBinding,
  type ProtocolVersion,
} from "@/components/agents/manualAgent";
import {
  buildAgentUpdate,
  hasChanges,
  toAuthType,
  toProtocolBinding,
  type CredentialChange,
  type EditableAgent,
} from "@/components/agents/editAgent";
import { isHttpUrl } from "@/hooks/useConnectAgentForm";
import { resolveTeamId, useTeams } from "@/hooks/useTeams";
import { extractApiErrorDetail } from "@/utils/errors";
import { getTagLabels } from "@/utils/tags";
import type { A2AAgentRead } from "@/generated/types";
import type { Agent } from "@/types/agent";
import type { Visibility } from "@/types/server";

export interface EditAgentErrors {
  name?: string;
  endpoint?: string;
  credentials?: string;
  teamId?: string;
  submit?: string;
}

const EMPTY_AUTH_VALUES: AgentAuthValues = {
  token: "",
  username: "",
  password: "", // pragma: allowlist secret
  headers: [],
  queryParamName: "",
  queryParamValue: "",
  oauthTokenUrl: "",
  oauthClientId: "",
  oauthClientSecret: "", // pragma: allowlist secret
  oauthScopes: "",
};

/** The agent as the form first shows it. Never reads a credential. */
export function toEditableAgent(agent: Agent): EditableAgent {
  return {
    name: agent.name,
    description: agent.description ?? "",
    endpointUrl: agent.endpointUrl,
    protocolVersion: agent.protocolVersion,
    protocolBinding: toProtocolBinding(agent.protocolBinding),
    tags: getTagLabels(agent.tags ?? []),
    visibility: (agent.visibility ?? "public") as Visibility,
    teamId: agent.teamId ?? undefined,
  };
}

interface UseEditAgentFormOptions {
  agent: Agent;
  /** The agent was saved, or nothing needed saving (`null`). */
  onSaved: (updated: A2AAgentRead | null) => void;
}

export function useEditAgentForm({ agent, onSaved }: UseEditAgentFormOptions) {
  const intl = useIntl();
  const { selectedTeamId } = useAuth();
  const { teams } = useTeams();
  const original = useMemo(() => toEditableAgent(agent), [agent]);
  const currentAuthType = toAuthType(agent.authType);

  const [name, setNameState] = useState(original.name);
  const [description, setDescription] = useState(original.description);
  const [endpointUrl, setEndpointUrlState] = useState(original.endpointUrl);
  const [protocolVersion, setProtocolVersion] = useState<ProtocolVersion>(
    original.protocolVersion === "0.3" ? "0.3" : "1.0",
  );
  // Stays `null` until the user picks one, so an agent with no binding set keeps none.
  const [protocolBinding, setProtocolBinding] = useState<ProtocolBinding | null>(
    original.protocolBinding,
  );
  const [tags, setTags] = useState(original.tags);
  const [visibility, setVisibilityState] = useState<Visibility>(original.visibility);
  const [chosenTeamId, setChosenTeamId] = useState<string | undefined>(original.teamId);

  // The stored credential is never shown, so the form starts by keeping it. Changing it
  // opens the credential fields, which then replace it.
  const [changingAuth, setChangingAuth] = useState(false);
  const [authType, setAuthTypeState] = useState<AgentAuthType>(currentAuthType);
  const [auth, setAuth] = useState<AgentAuthValues>(EMPTY_AUTH_VALUES);

  const [errors, setErrors] = useState<EditAgentErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const teamId =
    visibility === "team" ? resolveTeamId(teams, selectedTeamId, chosenTeamId) : undefined;

  const clearError = useCallback((key: keyof EditAgentErrors) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const setName = useCallback(
    (value: string) => {
      setNameState(value);
      clearError("name");
    },
    [clearError],
  );
  const setEndpointUrl = useCallback(
    (value: string) => {
      setEndpointUrlState(value);
      clearError("endpoint");
    },
    [clearError],
  );
  const setVisibility = useCallback(
    (value: Visibility) => {
      setVisibilityState(value);
      clearError("teamId");
      // A name conflict is judged against the visibility, so an old one no longer applies.
      clearError("name");
    },
    [clearError],
  );
  const setTeamId = useCallback(
    (value: string) => {
      setChosenTeamId(value);
      clearError("teamId");
      clearError("name");
    },
    [clearError],
  );

  const patchAuthValues = useCallback(
    (patch: Partial<AgentAuthValues>) => {
      setAuth((prev) => ({ ...prev, ...patch }));
      clearError("credentials");
    },
    [clearError],
  );
  const setAuthType = useCallback(
    (value: AgentAuthType) => {
      setAuthTypeState(value);
      // The "custom headers" tab starts with one empty row, as in the connect form.
      if (value === "authheaders") {
        setAuth((prev) =>
          prev.headers.length > 0
            ? prev
            : { ...prev, headers: [{ id: crypto.randomUUID(), key: "", value: "" }] },
        );
      }
      clearError("credentials");
    },
    [clearError],
  );
  const startChangingAuth = useCallback(() => {
    setChangingAuth(true);
    // Replacing starts from "no credential", never from the stored type, so the user
    // picks what the agent should use instead of retyping what is already there.
    setAuthTypeState("none");
  }, []);
  const keepAuth = useCallback(() => {
    setChangingAuth(false);
    setAuthTypeState(currentAuthType);
    setAuth(EMPTY_AUTH_VALUES);
    clearError("credentials");
  }, [currentAuthType, clearError]);

  const submit = useCallback(async () => {
    const next: EditAgentErrors = {};
    if (!name.trim()) next.name = intl.formatMessage({ id: "agents.connect.manual.name.required" });
    if (!isHttpUrl(endpointUrl.trim())) {
      next.endpoint = intl.formatMessage({ id: "agents.connect.manual.endpoint.invalid" });
    }
    if (visibility === "team" && !teamId) {
      next.teamId = intl.formatMessage({ id: "agents.connect.auth.teamRequired" });
    }
    if (changingAuth && !hasRequiredCredentials(authType, auth)) {
      next.credentials = intl.formatMessage({ id: "agents.connect.auth.credentialsRequired" }); // pragma: allowlist secret
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const credential: CredentialChange = changingAuth
      ? { kind: "replace", type: authType, values: auth }
      : { kind: "keep" };
    const body = buildAgentUpdate(
      original,
      {
        name,
        description,
        endpointUrl,
        protocolVersion,
        protocolBinding,
        tags,
        visibility,
        teamId,
      },
      credential,
    );
    // Nothing differs, so there is nothing to ask the gateway for.
    if (!hasChanges(body)) {
      onSaved(null);
      return;
    }

    setIsSubmitting(true);
    try {
      onSaved(await agentsApi.update(agent.id as string, body));
    } catch (err) {
      const detail = err instanceof ApiError ? extractApiErrorDetail(err.body) : null;
      const message = detail || intl.formatMessage({ id: "agents.edit.error.save" });
      // 409 is a name that already exists for the chosen visibility; show it on the name.
      if (err instanceof ApiError && err.status === 409 && body.name !== undefined) {
        setErrors({ name: message });
      } else {
        setErrors({ submit: message });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    name,
    description,
    endpointUrl,
    protocolVersion,
    protocolBinding,
    tags,
    visibility,
    teamId,
    changingAuth,
    authType,
    auth,
    original,
    agent.id,
    onSaved,
    intl,
  ]);

  return {
    name,
    setName,
    description,
    setDescription,
    endpointUrl,
    setEndpointUrl,
    protocolVersion,
    setProtocolVersion,
    protocolBinding,
    setProtocolBinding,
    tags,
    setTags,
    visibility,
    setVisibility,
    teams,
    teamId,
    setTeamId,
    currentAuthType,
    changingAuth,
    startChangingAuth,
    keepAuth,
    authType,
    setAuthType,
    auth,
    patchAuthValues,
    errors,
    clearError,
    isSubmitting,
    submit,
  };
}

export type EditAgentFormState = ReturnType<typeof useEditAgentForm>;
