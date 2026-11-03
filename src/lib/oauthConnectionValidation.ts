import type { IntlShape } from "react-intl";
import type { OAuthStatusEntry } from "@/api/oauth";
import type { MCPServer } from "@/types/server";
import type { OAuthConnectionValidationResponse } from "@/api/contracts/oauthConnectionValidation";

export const VALIDATION_STAGES = ["token", "negotiation", "tools_list"] as const;

const ERROR_CODES = new Set([
  "invalid_scope",
  "insufficient_scope",
  "redirect_uri_mismatch",
  "token_url_unreachable",
  "authorization_missing",
  "token_expired",
  "invalid_token",
  "invalid_client",
  "invalid_request",
  "unauthorized_client",
  "unsupported_response_type",
  "server_error",
  "temporarily_unavailable",
  "token_exchange_failed",
  "access_denied",
  "issuer_mismatch",
  "gateway_unavailable",
  "permission_denied",
  "unsupported_auth",
  "token_storage_unavailable",
  "tools_unsupported",
  "tools_list_failed",
  "mcp_handshake_failed",
  "timeout",
  "blocked",
  "incompatible",
  "request_invalid",
  "rate_limited",
  "network",
  "unauthenticated",
]);

export function oauthErrorMessage(intl: IntlShape, code?: string): string {
  return intl.formatMessage({
    id: `mcpServer.oauthValidation.error.${code && ERROR_CODES.has(code) ? code : "generic"}`,
  });
}

export function hasValidationStages(result: OAuthConnectionValidationResponse): boolean {
  return VALIDATION_STAGES.every((stage) =>
    ["ok", "failed", "skipped", "unsupported"].includes(result?.stages?.[stage] ?? ""),
  );
}

export function validationSucceeded(result: OAuthConnectionValidationResponse): boolean {
  return (
    result?.success === true && VALIDATION_STAGES.every((stage) => result.stages?.[stage] === "ok")
  );
}

export function canValidateOAuthConnection(server: MCPServer, status?: OAuthStatusEntry): boolean {
  return (
    server.enabled &&
    server.authType?.toLowerCase() === "oauth" &&
    server.oauthConfig?.grant_type === "authorization_code" &&
    status?.state === "ready" &&
    (status.tokenStatus === "valid" || status.tokenStatus === "near_expiry")
  );
}

export function oauthConfigurationKey(server: MCPServer): string {
  return JSON.stringify([
    server.url,
    server.transport,
    server.enabled,
    server.authType,
    server.oauthConfig,
  ]);
}
