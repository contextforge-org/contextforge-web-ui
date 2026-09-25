import { Activity, CircleDashed, CircleSlash, type LucideIcon } from "lucide-react";

import type { OAuthStatusEntry } from "@/hooks/useOAuthStatuses";
import { STATUS_ICON } from "@/lib/status";

export type ServerAvailability =
  | "active"
  | "authorization_required"
  | "authorization_expired"
  | "authorization_expiring"
  | "authorization_checking"
  | "authorization_unavailable"
  | "unreachable"
  | "checking"
  | "inactive";

const AUTHORIZATION_AVAILABILITIES: ReadonlySet<ServerAvailability> = new Set([
  "authorization_required",
  "authorization_expired",
  "authorization_expiring",
  "authorization_checking",
  "authorization_unavailable",
]);

export interface ServerAvailabilityInput {
  enabled: boolean;
  reachable: boolean;
  lastSeen?: string | null;
}

export function isOAuthServer(server: {
  authType?: string | null;
  oauthConfig?: unknown;
}): boolean {
  return server.authType?.toLowerCase() === "oauth" || server.oauthConfig != null;
}

interface AvailabilityPresentation {
  Icon: LucideIcon;
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
  authorization_required: {
    Icon: STATUS_ICON.warning,
    iconClassName: "text-warning",
    labelId: "mcpServer.status.authRequired",
    shortLabelId: "mcpServer.status.auth.short",
    detailId: "mcpServer.status.detail.authRequired",
  },
  authorization_expired: {
    Icon: STATUS_ICON.error,
    iconClassName: "text-destructive",
    labelId: "mcpServer.status.authExpired",
    shortLabelId: "mcpServer.status.auth.short",
    detailId: "mcpServer.status.detail.authExpired",
  },
  authorization_expiring: {
    Icon: STATUS_ICON.warning,
    iconClassName: "text-warning",
    labelId: "mcpServer.status.authExpiring",
    shortLabelId: "mcpServer.status.auth.short",
    detailId: "mcpServer.status.detail.authExpiring",
  },
  authorization_checking: {
    Icon: CircleDashed,
    iconClassName: "text-muted-foreground",
    labelId: "mcpServer.status.authChecking",
    shortLabelId: "mcpServer.status.authChecking",
    detailId: "mcpServer.status.detail.authChecking",
  },
  authorization_unavailable: {
    Icon: STATUS_ICON.warning,
    iconClassName: "text-muted-foreground",
    labelId: "mcpServer.status.authUnavailable",
    shortLabelId: "mcpServer.status.unavailable",
    detailId: "mcpServer.status.detail.authUnavailable",
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

export function getServerAvailability(
  server: ServerAvailabilityInput,
  oauthStatus?: OAuthStatusEntry,
): ServerAvailability {
  // Caller-scoped authorization state intentionally outranks server lifecycle,
  // including for disabled servers, so failures never imply usable authorization.
  if (oauthStatus?.state === "loading") return "authorization_checking";
  if (oauthStatus?.state === "unavailable") return "authorization_unavailable";
  if (oauthStatus?.state === "ready") {
    if (oauthStatus.tokenStatus === "missing") return "authorization_required";
    if (oauthStatus.tokenStatus === "expired") return "authorization_expired";
    if (oauthStatus.tokenStatus === "near_expiry") return "authorization_expiring";
  }
  if (!server.enabled) return "inactive";
  if (server.reachable) return "active";
  return server.lastSeen ? "unreachable" : "checking";
}

export function getAvailabilityPresentation(availability: ServerAvailability) {
  return PRESENTATION[availability];
}

export function needsOAuthAuthorization(availability: ServerAvailability): boolean {
  return availability === "authorization_required" || availability === "authorization_expired";
}

export function isAuthorizationAvailability(availability: ServerAvailability): boolean {
  return AUTHORIZATION_AVAILABILITIES.has(availability);
}
