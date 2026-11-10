import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { useAuth } from "@/auth/useAuth";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import {
  credentialFields,
  hasRequiredCredentials,
  type AgentAuthType,
  type AgentAuthValues,
  type ProtocolVersion,
} from "@/components/agents/manualAgent";
import type { CustomHeader } from "@/components/mcp-servers/CustomHeadersAuth";
import { resolveTeamId, useTeams } from "@/hooks/useTeams";
import { extractApiErrorDetail } from "@/utils/errors";
import type { A2AAgentCreate, A2AAgentRead, BodyCreateA2aAgentV1A2aPost } from "@/generated/types";
import type { Visibility } from "@/types/server";
import type { FetchCardOutcome, FetchCardResult, SuggestedAgent } from "@/types/agentCard";

export type ConnectAgentStep = "url" | "review" | "auth";

/** Auth types the card flow can collect credentials for. Anything else blocks registration. */
const SUPPORTED_CARD_AUTH_TYPES = new Set(["bearer", "basic", "authheaders", "query_param"]);

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Why no card was read: what the gateway reported, or `error` when the request itself failed. */
export type CardIssue = Exclude<FetchCardOutcome, "found"> | "error";

export interface ConnectAgentErrors {
  url?: string;
  name?: string;
  endpoint?: string;
  credentials?: string;
  teamId?: string;
  submit?: string;
}

interface UseConnectAgentFormOptions {
  onCreated: (agent: A2AAgentRead) => void;
}

export function useConnectAgentForm({ onCreated }: UseConnectAgentFormOptions) {
  const intl = useIntl();
  const { selectedTeamId } = useAuth();
  const { teams } = useTeams();

  const [step, setStep] = useState<ConnectAgentStep>("url");
  const [url, setUrlState] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  /** Why the card could not be read, if it could not. */
  const [cardIssue, setCardIssue] = useState<CardIssue | null>(null);
  const [result, setResult] = useState<FetchCardResult | null>(null);

  // Credentials are shared by the card flow and the manual form; only one is ever in use.
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [headers, setHeaders] = useState<CustomHeader[]>([]);
  const [queryParamName, setQueryParamName] = useState("");
  const [queryParamValue, setQueryParamValue] = useState("");
  const [oauthTokenUrl, setOauthTokenUrl] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");

  const [visibility, setVisibilityState] = useState<Visibility>("public");
  const [chosenTeamId, setChosenTeamId] = useState<string | undefined>(undefined);
  // Optional extras for an agent registered from its card. `cardDescription` replaces the
  // card's own description when filled in.
  const [agentName, setAgentNameState] = useState("");
  const [cardTags, setCardTags] = useState<string[]>([]);
  const [cardDescription, setCardDescription] = useState("");

  // "Enter manually": for agents that publish no card.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualEndpoint, setManualEndpoint] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [protocolVersion, setProtocolVersion] = useState<ProtocolVersion>("1.0");
  const [manualAuthType, setManualAuthTypeState] = useState<AgentAuthType>("none");

  const [errors, setErrors] = useState<ConnectAgentErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggested: SuggestedAgent = useMemo(() => result?.suggestedAgent ?? {}, [result]);
  const authType = (suggested.auth_type ?? null) as AgentAuthType | null;
  const isAuthSupported = !authType || SUPPORTED_CARD_AUTH_TYPES.has(authType);
  const teamId =
    visibility === "team" ? resolveTeamId(teams, selectedTeamId, chosenTeamId) : undefined;

  const authValues: AgentAuthValues = useMemo(
    () => ({
      token,
      username,
      password,
      headers,
      queryParamName,
      queryParamValue,
      oauthTokenUrl,
      oauthClientId,
      oauthClientSecret,
      oauthScopes,
    }),
    [
      token,
      username,
      password,
      headers,
      queryParamName,
      queryParamValue,
      oauthTokenUrl,
      oauthClientId,
      oauthClientSecret,
      oauthScopes,
    ],
  );

  const clearError = useCallback((key: keyof ConnectAgentErrors) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const manualUntouched =
    !manualName &&
    !manualEndpoint &&
    !manualDescription &&
    manualTags.length === 0 &&
    manualAuthType === "none";

  const setUrl = useCallback(
    (value: string) => {
      setUrlState(value);
      // A different URL deserves a fresh card read. If the manual form was only
      // opened because the last read failed, put it away so Connect reads again.
      if (cardIssue && manualUntouched) setManualOpen(false);
      setCardIssue(null);
      clearError("url");
    },
    [cardIssue, manualUntouched, clearError],
  );

  const setVisibility = useCallback(
    (value: Visibility) => {
      setVisibilityState(value);
      clearError("teamId");
    },
    [clearError],
  );

  const setTeamId = useCallback(
    (value: string) => {
      setChosenTeamId(value);
      clearError("teamId");
    },
    [clearError],
  );

  const setAgentName = useCallback(
    (value: string) => {
      setAgentNameState(value);
      clearError("name");
    },
    [clearError],
  );

  const setManualAuthType = useCallback(
    (value: AgentAuthType) => {
      setManualAuthTypeState(value);
      // The "custom headers" tab starts with one empty row, as in the design.
      if (value === "authheaders") {
        setHeaders((prev) =>
          prev.length > 0 ? prev : [{ id: crypto.randomUUID(), key: "", value: "" }],
        );
      }
      clearError("credentials");
    },
    [clearError],
  );

  const resetAuthValues = useCallback((next: SuggestedAgent) => {
    setToken("");
    setUsername("");
    setPassword("");
    setHeaders(
      next.auth_type === "authheaders"
        ? [{ id: crypto.randomUUID(), key: next.auth_header_key ?? "", value: "" }]
        : [],
    );
    setQueryParamName(next.auth_query_param_key ?? "");
    setQueryParamValue("");
    setOauthTokenUrl("");
    setOauthClientId("");
    setOauthClientSecret("");
    setOauthScopes("");
  }, []);

  /** Step 1: read the card. Only a found card advances; anything else opens manual entry, saying why. */
  const submitUrl = useCallback(async () => {
    const trimmed = url.trim();
    if (!isHttpUrl(trimmed)) {
      setErrors((prev) => ({
        ...prev,
        url: intl.formatMessage({ id: "agents.connect.url.invalid" }),
      }));
      return;
    }

    setIsFetching(true);
    setCardIssue(null);
    try {
      const fetched = await agentsApi.fetchCard(trimmed);
      if (fetched.outcome === "found" && fetched.card && fetched.suggestedAgent) {
        setResult(fetched);
        resetAuthValues(fetched.suggestedAgent);
        setAgentNameState(fetched.suggestedAgent.name ?? fetched.card.name ?? "");
        setCardTags([]);
        setCardDescription("");
        setStep("review");
      } else {
        // A "found" outcome without a usable card is as good as no card.
        setCardIssue(fetched.outcome === "found" ? "no_card" : fetched.outcome);
        setManualOpen(true);
      }
    } catch {
      setCardIssue("error");
      setManualOpen(true);
    } finally {
      setIsFetching(false);
    }
  }, [url, intl, resetAuthValues]);

  const goToAuth = useCallback(() => setStep("auth"), []);

  /** One step back. From the first step the caller leaves the form instead. */
  const goBack = useCallback((): boolean => {
    // Errors belong to the step they came from; don't carry them to the one before.
    setErrors({});
    if (step === "auth") {
      setStep("review");
      return true;
    }
    if (step === "review") {
      setStep("url");
      return true;
    }
    return false;
  }, [step]);

  const missingAuthValues = useCallback(
    (type: AgentAuthType | null): string | undefined =>
      hasRequiredCredentials(type, authValues)
        ? undefined
        : intl.formatMessage({ id: "agents.connect.auth.credentialsRequired" }),
    [authValues, intl],
  );

  const create = useCallback(
    async (payload: BodyCreateA2aAgentV1A2aPost) => {
      setIsSubmitting(true);
      try {
        const created = await agentsApi.create(payload);
        onCreated(created);
      } catch (err) {
        const detail = err instanceof ApiError ? extractApiErrorDetail(err.body) : null;
        setErrors({ submit: detail || intl.formatMessage({ id: "agents.connect.error.create" }) });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onCreated, intl],
  );

  /** Registers the agent the card described, with the name, credentials and extras entered. */
  const submit = useCallback(async () => {
    const next: ConnectAgentErrors = {};
    if (!isAuthSupported) {
      next.submit = intl.formatMessage({ id: "agents.connect.auth.unsupported" });
    }
    if (!agentName.trim()) {
      next.name = intl.formatMessage({ id: "agents.connect.review.name.required" });
    }
    next.credentials = missingAuthValues(authType);
    if (visibility === "team" && !teamId) {
      next.teamId = intl.formatMessage({ id: "agents.connect.auth.teamRequired" });
    }
    setErrors(next);
    if (next.submit || next.name || next.credentials || next.teamId) return;

    if (!suggested.name || !suggested.endpoint_url) {
      setErrors({ submit: intl.formatMessage({ id: "agents.connect.error.incompleteCard" }) });
      return;
    }

    const description = cardDescription.trim();
    // Everything the card yielded, plus only what a card cannot contain.
    const agent: A2AAgentCreate = {
      ...suggested,
      name: agentName.trim(),
      endpoint_url: suggested.endpoint_url,
      ...(description ? { description } : {}),
      ...(cardTags.length > 0 ? { tags: cardTags } : {}),
      ...credentialFields(authType, authValues),
    };
    await create({ agent, visibility, ...(teamId ? { team_id: teamId } : {}) });
  }, [
    isAuthSupported,
    agentName,
    missingAuthValues,
    authType,
    visibility,
    teamId,
    suggested,
    cardDescription,
    cardTags,
    authValues,
    create,
    intl,
  ]);

  /** The card needs credentials, so the user is asked for them before registering. */
  const requiresAuth = Boolean(authType && authType !== "none"); // pragma: allowlist secret

  /**
   * "Continue" on the review page. A card that needs credentials goes on to the
   * authenticate page; one that does not is registered straight away.
   */
  const continueFromReview = useCallback(async () => {
    if (!agentName.trim()) {
      setErrors({ name: intl.formatMessage({ id: "agents.connect.review.name.required" }) });
      return;
    }
    if (requiresAuth) {
      setErrors({});
      setStep("auth");
      return;
    }
    await submit();
  }, [agentName, requiresAuth, submit, intl]);

  /**
   * The single key the authenticate page asks for, when the card names where it goes
   * (a bearer token, an API-key header or an API-key query parameter). This follows what
   * the card said, not what the user has typed, so the layout does not change under them.
   */
  const keyName = (
    authType === "authheaders"
      ? (suggested.auth_header_key ?? "")
      : authType === "query_param"
        ? (suggested.auth_query_param_key ?? "")
        : ""
  ).trim();
  const singleKey =
    authType === "bearer" ||
    ((authType === "authheaders" || authType === "query_param") && Boolean(keyName));
  const keyValue =
    authType === "bearer"
      ? token
      : authType === "authheaders"
        ? (headers[0]?.value ?? "")
        : authType === "query_param"
          ? queryParamValue
          : "";
  const setKeyValue = useCallback(
    (value: string) => {
      clearError("credentials");
      if (authType === "bearer") setToken(value);
      else if (authType === "query_param") setQueryParamValue(value);
      else if (authType === "authheaders") {
        setHeaders((prev) => [{ id: prev[0]?.id ?? crypto.randomUUID(), key: keyName, value }]);
      }
    },
    [authType, keyName, clearError],
  );

  /** Registers an agent from the manually entered details. No card is stored for it. */
  const submitManual = useCallback(async () => {
    const next: ConnectAgentErrors = {};
    const name = manualName.trim();
    const endpoint = manualEndpoint.trim();
    if (!name) next.name = intl.formatMessage({ id: "agents.connect.manual.name.required" });
    if (!isHttpUrl(endpoint)) {
      next.endpoint = intl.formatMessage({ id: "agents.connect.manual.endpoint.invalid" });
    }
    next.credentials = missingAuthValues(manualAuthType);
    if (visibility === "team" && !teamId) {
      next.teamId = intl.formatMessage({ id: "agents.connect.auth.teamRequired" });
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const description = manualDescription.trim();
    const agent: A2AAgentCreate = {
      name,
      endpoint_url: endpoint,
      protocol_version: protocolVersion,
      // TODO(IBM/mcp-context-forge#7383): also send the protocol binding once the API stores one.
      ...(description ? { description } : {}),
      ...(manualTags.length > 0 ? { tags: manualTags } : {}),
      ...credentialFields(manualAuthType, authValues),
    };
    await create({ agent, visibility, ...(teamId ? { team_id: teamId } : {}) });
  }, [
    manualName,
    manualEndpoint,
    manualDescription,
    manualTags,
    manualAuthType,
    protocolVersion,
    visibility,
    teamId,
    authValues,
    missingAuthValues,
    create,
    intl,
  ]);

  return {
    step,
    url,
    setUrl,
    isFetching,
    cardIssue,
    result,
    submitUrl,
    goToAuth,
    goBack,
    authType,
    isAuthSupported,
    token,
    setToken,
    username,
    setUsername,
    password,
    setPassword,
    headers,
    setHeaders,
    queryParamName,
    setQueryParamName,
    queryParamValue,
    setQueryParamValue,
    oauthTokenUrl,
    setOauthTokenUrl,
    oauthClientId,
    setOauthClientId,
    oauthClientSecret,
    setOauthClientSecret,
    oauthScopes,
    setOauthScopes,
    visibility,
    setVisibility,
    teams,
    teamId,
    setTeamId,
    agentName,
    setAgentName,
    cardTags,
    setCardTags,
    cardDescription,
    setCardDescription,
    requiresAuth,
    continueFromReview,
    singleKey,
    keyName,
    keyValue,
    setKeyValue,
    manualOpen,
    setManualOpen,
    manualName,
    setManualName,
    manualEndpoint,
    setManualEndpoint,
    manualDescription,
    setManualDescription,
    manualTags,
    setManualTags,
    protocolVersion,
    setProtocolVersion,
    manualAuthType,
    setManualAuthType,
    submitManual,
    errors,
    clearError,
    isSubmitting,
    submit,
  };
}

export type ConnectAgentFormState = ReturnType<typeof useConnectAgentForm>;
