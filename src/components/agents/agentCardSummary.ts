import type { AgentCard, AgentCardInterface } from "@/types/agentCard";

/** Human-readable name for each oneof key a 1.0 card wraps a security scheme in. */
const SCHEME_LABELS: Record<string, string> = {
  apiKeySecurityScheme: "API key",
  oauth2SecurityScheme: "OAuth 2.0",
  openIdConnectSecurityScheme: "OpenID Connect",
  mtlsSecurityScheme: "mTLS",
};

function describeInterface(item: AgentCardInterface): string {
  return [item.protocolBinding, item.protocolVersion].filter(Boolean).join(" ") || item.url;
}

/** "JSONRPC 1.0 (preferred), HTTP+JSON 1.0". The first interface is the card's preferred one. */
export function summarizeInterfaces(card: AgentCard): string {
  const interfaces = card.supportedInterfaces ?? [];
  return interfaces
    .map((item, index) =>
      index === 0 && interfaces.length > 1
        ? `${describeInterface(item)} (preferred)`
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

function labelScheme(wrapped: Record<string, Record<string, unknown>> | undefined): string | null {
  if (!wrapped) return null;
  const [key, body] = Object.entries(wrapped)[0] ?? [];
  if (!key) return null;
  if (key === "httpAuthSecurityScheme") {
    const scheme = body?.scheme;
    return typeof scheme === "string" && scheme ? scheme.toLowerCase() : "HTTP";
  }
  return SCHEME_LABELS[key] ?? null;
}

/**
 * The credential kinds a card asks for, e.g. "bearer or OAuth 2.0". Requirements
 * are alternatives, so they are joined with "or"; schemes inside one requirement
 * must all be met, so they are joined with "and". Empty when the card declares none.
 */
export function summarizeRequirements(card: AgentCard): string {
  const schemes = card.securitySchemes ?? {};
  const alternatives = (card.securityRequirements ?? [])
    .map((requirement) =>
      Object.keys(requirement.schemes ?? {})
        .map((name) => labelScheme(schemes[name]))
        .filter((label): label is string => Boolean(label))
        .join(" and "),
    )
    .filter(Boolean);
  return [...new Set(alternatives)].join(" or ");
}
