import type { CatalogServer } from "@/generated/types";
import type { OAuthStatusEntry } from "@/api/oauth";
import { isCatalogOAuthServer } from "@/utils/catalogAuthTypes";

export interface CatalogTestAction {
  kind: "oauth" | "generic";
  availability: "hidden" | "disabled" | "enabled";
}

// Keep menu visibility, disabled state and click handling on the same policy.
export function catalogTestAction(
  server: CatalogServer,
  options: {
    status?: OAuthStatusEntry;
    canTest: boolean;
    canUpdate: boolean;
    canValidate: boolean;
    pending: boolean;
  },
): CatalogTestAction {
  const kind =
    isCatalogOAuthServer(server) && options.status?.state !== "not_applicable"
      ? "oauth"
      : "generic";
  const availability =
    !options.canTest || (kind === "oauth" && !options.canUpdate)
      ? "hidden"
      : server.requires_oauth_config ||
          options.pending ||
          (kind === "oauth" && !options.canValidate)
        ? "disabled"
        : "enabled";
  return { kind, availability };
}
