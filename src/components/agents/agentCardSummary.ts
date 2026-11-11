import type { IntlShape } from "react-intl";
import type { AgentCard, AgentCardInterface, AgentCardSecurityScheme } from "@/types/agentCard";

/** Message id for the name of each oneof key a 1.0 card wraps a security scheme in. */
const SCHEME_LABEL_IDS: Record<string, string> = {
  apiKeySecurityScheme: "agents.connect.review.scheme.apiKey", // pragma: allowlist secret
  oauth2SecurityScheme: "agents.connect.review.scheme.oauth2",
  openIdConnectSecurityScheme: "agents.connect.review.scheme.openIdConnect",
  mtlsSecurityScheme: "agents.connect.review.scheme.mtls",
};

function describeInterface(item: AgentCardInterface): string {
  return [item.protocolBinding, item.protocolVersion].filter(Boolean).join(" ") || item.url;
}

/** "JSONRPC 1.0 (preferred), HTTP+JSON 1.0". The first interface is the card's preferred one. */
export function summarizeInterfaces(card: AgentCard, intl: IntlShape): string {
  const interfaces = card.supportedInterfaces ?? [];
  return interfaces
    .map((item, index) =>
      index === 0 && interfaces.length > 1
        ? intl.formatMessage(
            { id: "agents.connect.review.preferred" },
            { interface: describeInterface(item) },
          )
        : describeInterface(item),
    )
    .join(", ");
}

/** The host of the card's first interface, which is where the agent is called. */
export function summarizeEndpoint(card: AgentCard): string {
  const url = card.supportedInterfaces?.[0]?.url;
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function labelScheme(wrapped: AgentCardSecurityScheme | undefined, intl: IntlShape): string | null {
  if (!wrapped) return null;
  const key = Object.keys(wrapped)[0];
  if (!key) return null;
  if (key === "httpAuthSecurityScheme") {
    // The HTTP auth scheme's own name ("bearer", "basic"), not something to translate.
    const scheme = wrapped.httpAuthSecurityScheme?.scheme;
    return scheme ? scheme.toLowerCase() : "HTTP";
  }
  const labelId = SCHEME_LABEL_IDS[key];
  return labelId ? intl.formatMessage({ id: labelId }) : null;
}

/**
 * The credential kinds a card asks for, e.g. "bearer or OAuth 2.0". Requirements
 * are alternatives, so they are joined with "or"; schemes inside one requirement
 * must all be met, so they are joined with "and". Empty when the card declares none.
 */
export function summarizeRequirements(card: AgentCard, intl: IntlShape): string {
  const schemes = card.securitySchemes ?? {};
  const alternatives = (card.securityRequirements ?? [])
    .map((requirement) =>
      intl.formatList(
        Object.keys(requirement.schemes ?? {})
          .map((name) => labelScheme(schemes[name], intl))
          .filter((label): label is string => Boolean(label)),
        { type: "conjunction" },
      ),
    )
    .filter(Boolean);
  return intl.formatList([...new Set(alternatives)], { type: "disjunction" });
}
