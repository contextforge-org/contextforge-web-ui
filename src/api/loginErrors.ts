import { ApiError } from "./client";
import { extractUpstreamApiErrorDetail } from "@/utils/errors";

export type LoginError =
  | { kind: "invalidCredentials" }
  | { kind: "passwordChangeRequired" }
  | { kind: "failed"; status: number };

const PASSWORD_CHANGE_REQUIRED_PATTERN = /password change required/i;

/**
 * Classify POST /auth/login failures. Scoped to the login endpoint only —
 * do not merge with classifyPasswordResetError (./passwordResetErrors), which
 * assigns a different meaning to 403 for the password-reset-request flow.
 */
export function classifyLoginError(error: unknown): LoginError {
  if (!(error instanceof ApiError)) return { kind: "failed", status: 0 };
  if (error.status === 401) return { kind: "invalidCredentials" };

  if (error.status === 403) {
    const detail = extractUpstreamApiErrorDetail(error.body);
    if (detail && PASSWORD_CHANGE_REQUIRED_PATTERN.test(detail)) {
      return { kind: "passwordChangeRequired" };
    }
  }

  return { kind: "failed", status: error.status };
}
