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
import type {
  A2AAgentCreateWithCard,
  FetchCardOutcome,
  FetchCardResult,
  SuggestedAgent,
} from "@/types/agentCard";

export type ConnectAgentStep = "url" | "review" | "auth";

/** Auth types the card flow can collect credentials for. Anything else blocks registration. */
const SUPPORTED_CARD_AUTH_TYPES = new Set([
  "bearer",
  "basic",
  "authheaders",
  "query_param",
  "oauth",
]);

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Why no card was read: what the gateway reported, or `error` when the request itself failed. */
export type CardIssue = Exclude<FetchCardOutcome, "found"> | "credential_rejected" | "error";

/** The `Authorization` header value for a credential typed on the URL step. */
function authorizationValue(scheme: string | null, credential: string): string {
  if (scheme?.toLowerCase() === "basic") {
    const bytes = new TextEncoder().encode(credential);
    return `Basic ${btoa(String.fromCharCode(...bytes))}`;
  }
  return `${scheme || "Bearer"} ${credential}`;
}

/** The origin of an endpoint, which the gateway uses as the OAuth resource when none is set. Empty when it isn't a URL. */
function originOf(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

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
  // A card behind authentication: the scheme the agent asked for and the credential typed for it.
  const [authScheme, setAuthScheme] = useState<string | null>(null);
  const [needsCredential, setNeedsCredential] = useState(false);
  const [fetchCredential, setFetchCredentialState] = useState("");
  /** The credential that read the card is also the agent's, so registration does not ask again. */
  const [credentialReused, setCredentialReused] = useState(false);

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
  // Left empty unless the user types one: the gateway defaults an empty resource to the
  // agent's origin, so that origin is only shown as the placeholder.
  const [oauthResource, setOauthResource] = useState("");
  const [oauthResourceDefault, setOauthResourceDefault] = useState("");

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
  // No mapped `auth_type` does not mean no security: the gateway leaves it out when the card's
  // requirements can't be stored (mTLS, OpenID Connect, a cookie key, several schemes at once...).
  const declaresSecurity = (result?.card?.securityRequirements ?? []).some(
    (requirement) => Object.keys(requirement.schemes ?? {}).length > 0,
  );
  const hasAuthType = Boolean(authType && authType !== "none"); // pragma: allowlist secret
  // Only client credentials can be registered; a card offering another OAuth flow cannot.
  // The token URL comes from the card and is not editable, so without one it cannot be set up here.
  const oauthSupported =
    suggested.oauth_config?.grant_type === "client_credentials" &&
    typeof suggested.oauth_config.token_url === "string" &&
    suggested.oauth_config.token_url.trim() !== "";
  const isAuthSupported = hasAuthType
    ? SUPPORTED_CARD_AUTH_TYPES.has(authType as AgentAuthType) &&
      (authType !== "oauth" || oauthSupported)
    : !declaresSecurity;
  const authUnsupportedMessageId =
    authType === "oauth" && !oauthSupported
      ? "agents.connect.auth.unsupported"
      : "agents.connect.auth.unmapped";
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
      oauthResource,
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
      oauthResource,
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
      // A credential was typed for one host; never send it to another.
      setNeedsCredential(false);
      setAuthScheme(null);
      setFetchCredentialState("");
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

  const setFetchCredential = useCallback(
    (value: string) => {
      setFetchCredentialState(value);
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
    // The card's token URL and scopes are shown read-only; only the client is entered.
    setOauthTokenUrl(String(next.oauth_config?.token_url ?? ""));
    setOauthClientId("");
    setOauthClientSecret("");
    setOauthScopes(
      Array.isArray(next.oauth_config?.scopes) ? next.oauth_config.scopes.join(" ") : "",
    );
    setOauthResource("");
    setOauthResourceDefault(originOf(next.endpoint_url));
  }, []);

  /**
   * A credential that read the card also authenticates the agent when the card asks for the
   * same scheme, so carry it over instead of asking for it twice.
   */
  const reuseCredential = useCallback(
    (next: SuggestedAgent, credential: string, enteredUrl: string) => {
      const scheme = (authScheme ?? "bearer").toLowerCase(); // pragma: allowlist secret
      // The card names the agent's endpoint; only send the credential there if it is the
      // site the user typed it for. Otherwise the authenticate step asks for it again.
      const sameSite = originOf(next.endpoint_url) === originOf(enteredUrl);
      const reuse =
        Boolean(credential) &&
        sameSite &&
        ((next.auth_type === "bearer" && scheme === "bearer") ||
          (next.auth_type === "basic" && scheme === "basic" && credential.includes(":")));
      setCredentialReused(reuse);
      if (!reuse) return;
      if (next.auth_type === "bearer") {
        setToken(credential);
      } else {
        const split = credential.indexOf(":");
        setUsername(credential.slice(0, split));
        setPassword(credential.slice(split + 1));
      }
    },
    [authScheme],
  );

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

    const credential = fetchCredential.trim();
    if (needsCredential && !credential) {
      setErrors((prev) => ({
        ...prev,
        credentials: intl.formatMessage({ id: "agents.connect.auth.credentialsRequired" }), // pragma: allowlist secret
      }));
      return;
    }

    setIsFetching(true);
    setCardIssue(null);
    try {
      const fetched = await agentsApi.fetchCard(
        trimmed,
        needsCredential ? { Authorization: authorizationValue(authScheme, credential) } : undefined,
      );
      if (fetched.outcome === "auth_required") {
        // Asked again with a credential in hand: the credential is what was refused.
        setCardIssue(needsCredential ? "credential_rejected" : "auth_required");
        setAuthScheme(fetched.authScheme ?? authScheme);
        setNeedsCredential(true);
      } else if (fetched.outcome === "found" && fetched.card && fetched.suggestedAgent) {
        setResult(fetched);
        resetAuthValues(fetched.suggestedAgent);
        reuseCredential(fetched.suggestedAgent, needsCredential ? credential : "", trimmed);
        setAgentNameState(fetched.suggestedAgent.name ?? fetched.card.name ?? "");
        setCardTags([]);
        setCardDescription("");
        setStep("review");
      } else {
        setNeedsCredential(false);
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
  }, [url, intl, resetAuthValues, reuseCredential, fetchCredential, needsCredential, authScheme]);

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
      next.submit = intl.formatMessage({ id: authUnsupportedMessageId });
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
    const agent: A2AAgentCreateWithCard = {
      ...suggested,
      name: agentName.trim(),
      endpoint_url: suggested.endpoint_url,
      // The gateway fetches the card again from here and stores it, so the agent keeps its card.
      card_url: result?.sourceUrl || url.trim(),
      ...(description ? { description } : {}),
      ...(cardTags.length > 0 ? { tags: cardTags } : {}),
      ...credentialFields(authType, authValues),
    };
    await create({ agent, visibility, ...(teamId ? { team_id: teamId } : {}) });
  }, [
    isAuthSupported,
    authUnsupportedMessageId,
    agentName,
    missingAuthValues,
    authType,
    visibility,
    teamId,
    suggested,
    result,
    url,
    cardDescription,
    cardTags,
    authValues,
    create,
    intl,
  ]);

  /** The card asks for security, so the next page is for authenticating rather than only for visibility. */
  const requiresAuth = hasAuthType || declaresSecurity; // pragma: allowlist secret

  /** "Continue" on the review page. Always goes on to the page that sets visibility and credentials. */
  const continueFromReview = useCallback(async () => {
    if (!agentName.trim()) {
      setErrors({ name: intl.formatMessage({ id: "agents.connect.review.name.required" }) });
      return;
    }
    setErrors({});
    setStep("auth");
  }, [agentName, intl]);

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
      // The manual form has no Resource field, so one typed in the card flow must not leak in.
      ...credentialFields(manualAuthType, { ...authValues, oauthResource: "" }),
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
    authScheme,
    needsCredential,
    fetchCredential,
    setFetchCredential,
    credentialReused,
    isAuthSupported,
    authUnsupportedMessageId,
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
    oauthResource,
    setOauthResource,
    oauthResourceDefault,
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
