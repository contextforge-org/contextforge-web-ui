import { Activity, CircleDashed, CircleSlash, type LucideIcon } from "lucide-react";

import { STATUS_ICON } from "@/lib/status";

/** Availability of an MCP server, shared by the servers page, source picker and catalog. */

/** Per-user token state from `GET /oauth/status`. `unknown` means the backend could not be read. */
export type OAuthTokenStatus = "valid" | "near_expiry" | "expired" | "missing" | "unknown";

export type ServerAvailability = "active" | "auth" | "unreachable" | "checking" | "inactive";

export interface ServerAvailabilityInput {
  enabled: boolean;
  reachable: boolean;
  lastSeen?: string | null;
}

interface AvailabilityPresentation {
  Icon: LucideIcon;
  /** Applies to the icon only; labels stay muted. */
  iconClassName: string;
  labelId: string;
  shortLabelId: string;
  detailId: string;
}

const PRESENTATION: Record<ServerAvailability, AvailabilityPresentation> = {
  active: {
    Icon: Activity,
    iconClassName: "text-success",
    labelId: "mcpServer.status.active",
    shortLabelId: "mcpServer.status.active",
    detailId: "mcpServer.status.detail.active",
  },
  auth: {
    Icon: STATUS_ICON.warning,
    iconClassName: "text-warning",
    labelId: "mcpServer.status.auth",
    shortLabelId: "mcpServer.status.auth.short",
    detailId: "mcpServer.status.detail.auth",
  },
  unreachable: {
    Icon: CircleSlash,
    iconClassName: "text-muted-foreground",
    labelId: "mcpServer.status.offline",
    shortLabelId: "mcpServer.status.offline",
    detailId: "mcpServer.status.detail.unreachable",
  },
  checking: {
    Icon: CircleDashed,
    iconClassName: "text-muted-foreground",
    labelId: "mcpServer.status.checking",
    shortLabelId: "mcpServer.status.checking",
    detailId: "mcpServer.status.detail.checking",
  },
  inactive: {
    Icon: CircleDashed,
    iconClassName: "text-muted-foreground",
    labelId: "mcpServer.status.inactive",
    shortLabelId: "mcpServer.status.inactive",
    detailId: "mcpServer.status.detail.inactive",
  },
};

const NEEDS_AUTHORIZATION: ReadonlySet<OAuthTokenStatus> = new Set(["missing", "expired"]);

/**
 * Classify a server. `auth` outranks every other state.
 *
 * @param server Availability fields from the gateway list response.
 * @param oauthTokenStatus The caller's own token state, when known.
 */
export function getServerAvailability(
  server: ServerAvailabilityInput,
  oauthTokenStatus?: OAuthTokenStatus,
): ServerAvailability {
  if (oauthTokenStatus && NEEDS_AUTHORIZATION.has(oauthTokenStatus)) return "auth";
  // A server disabled while up keeps `reachable: true` frozen.
  if (!server.enabled) return "inactive";
  if (server.reachable) return "active";
  return server.lastSeen ? "unreachable" : "checking";
}

/** Icon, tone and message ids for an availability state. */
export function getAvailabilityPresentation(
  availability: ServerAvailability,
): AvailabilityPresentation {
  return PRESENTATION[availability];
}
