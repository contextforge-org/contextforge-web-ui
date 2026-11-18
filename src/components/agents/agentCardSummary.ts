import type { IntlShape } from "react-intl";
import type {
  AgentCard,
  AgentCardInterface,
  AgentCardSecurityScheme,
  AgentCardSkill,
} from "@/types/agentCard";

/** Display names for protocol bindings; anything else is shown as the card spells it. */
const BINDING_LABELS: Record<string, string> = { JSONRPC: "JSON-RPC" };

function bindingLabel(item: AgentCardInterface): string {
  const binding = item.protocolBinding ?? "";
  return BINDING_LABELS[binding.toUpperCase()] ?? binding;
}

/** "JSON-RPC (preferred), HTTP+JSON". The first interface is the card's preferred one. */
export function summarizeInterfaces(card: AgentCard, intl: IntlShape): string {
  const interfaces = card.supportedInterfaces ?? [];
  return interfaces
    .map((item, index) => {
      const label = bindingLabel(item) || item.url;
      return index === 0 && interfaces.length > 1
        ? intl.formatMessage({ id: "agents.connect.review.preferred" }, { interface: label })
        : label;
    })
    .join(", ");
}

export interface InterfaceRow {
  binding: string;
  /** The A2A protocol version, e.g. "1.0". Empty when the card gives none. */
  version: string;
  /** The interface address without its scheme, e.g. "agents.example.com/a2a/v1". */
  address: string;
}

/** One row per declared interface, for the expanded card. */
export function interfaceRows(card: AgentCard): InterfaceRow[] {
  return (card.supportedInterfaces ?? []).map((item) => ({
    binding: bindingLabel(item) || item.url,
    version: item.protocolVersion ?? "",
    address: item.url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, ""),
  }));
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
  switch (key) {
    case "httpAuthSecurityScheme": {
      // The HTTP auth scheme's own name ("bearer", "basic"), not something to translate.
      const scheme = wrapped.httpAuthSecurityScheme?.scheme;
      return scheme ? scheme.toLowerCase() : "HTTP";
    }
    case "apiKeySecurityScheme":
      return intl.formatMessage(
        { id: "agents.connect.review.scheme.apiKey" }, // pragma: allowlist secret
        { location: wrapped.apiKeySecurityScheme?.location?.toLowerCase() ?? "header" },
      );
    case "oauth2SecurityScheme":
      return intl.formatMessage({ id: "agents.connect.review.scheme.oauth2" });
    case "openIdConnectSecurityScheme":
      return intl.formatMessage({ id: "agents.connect.review.scheme.openIdConnect" });
    case "mtlsSecurityScheme":
      return intl.formatMessage({ id: "agents.connect.review.scheme.mtls" });
    default:
      return null;
  }
}

/**
 * The credential kinds a card asks for, e.g. "bearer or oauth2". Requirements
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

/** Who publishes the agent: the organization and the host of its site. */
export function summarizePublisher(card: AgentCard): { name: string; site: string } | null {
  const name = card.provider?.organization?.trim() ?? "";
  const url = card.provider?.url?.trim() ?? "";
  let site = url;
  if (url) {
    try {
      site = new URL(url).host;
    } catch {
      site = url;
    }
  }
  return name || site ? { name, site } : null;
}

export interface CapabilityRow {
  /** Message id suffix: `streaming` or `extensions`. */
  key: "streaming" | "extensions";
  enabled: boolean;
}

/** The capabilities the card states, so a missing one is not shown as "no". */
export function capabilityRows(card: AgentCard): CapabilityRow[] {
  const capabilities = card.capabilities ?? {};
  const rows: CapabilityRow[] = [];
  if (typeof capabilities.streaming === "boolean") {
    rows.push({ key: "streaming", enabled: capabilities.streaming });
  }
  if (Array.isArray(capabilities.extensions)) {
    rows.push({ key: "extensions", enabled: capabilities.extensions.length > 0 });
  }
  return rows;
}

/** "text, application/pdf" or an empty string. */
export function joinModes(modes: string[] | undefined): string {
  return (modes ?? []).filter(Boolean).join(", ");
}

/** True when the card carries a signature. This is not a verification. */
export function isCardSigned(card: AgentCard): boolean {
  return Array.isArray(card.signatures) && card.signatures.length > 0;
}

/** Skills with something to say beyond their name, for the expanded card. */
export function describedSkills(card: AgentCard): AgentCardSkill[] {
  return (card.skills ?? []).filter(
    (skill) =>
      skill.description?.trim() || joinModes(skill.inputModes) || joinModes(skill.outputModes),
  );
}
