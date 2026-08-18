import { ApiError } from "./client";
import { extractApiErrorDetail } from "@/utils/errors";

export type ChangePasswordRequiredError =
  | { kind: "invalidOldPassword" }
  | { kind: "policyViolation"; message: string | null }
  // Password WAS changed successfully — the BFF just couldn't log back in
  // and establish a session right after. Not a validation failure.
  | { kind: "changedButLoginFailed" }
  | { kind: "failed" };

/**
 * Classify POST /auth/change-password-required failures. The BFF route
 * (server/src/routes/auth/change-password-required.ts) forwards whichever
 * upstream call failed first: a 401/403 means the re-authentication step
 * (old password) was rejected; a 400/422 means the new password itself was
 * rejected (policy); `{ error: "login_after_change_failed" }` means the
 * change succeeded but the follow-up login/session-establishment didn't.
 * Scoped to this endpoint only — do not merge with classifyLoginError or
 * classifyPasswordResetError, which assign 403 different meanings for their
 * own endpoints.
 */
export function classifyChangePasswordRequiredError(error: unknown): ChangePasswordRequiredError {
  if (!(error instanceof ApiError)) return { kind: "failed" };

  const body = error.body as { error?: string } | null;
  if (body?.error === "login_after_change_failed") return { kind: "changedButLoginFailed" };

  if (error.status === 401 || error.status === 403) return { kind: "invalidOldPassword" };

  if (error.status === 400 || error.status === 422) {
    return { kind: "policyViolation", message: extractApiErrorDetail(error.body) };
  }

  return { kind: "failed" };
}
