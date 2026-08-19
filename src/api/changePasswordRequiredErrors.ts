import { ApiError } from "./client";
import { extractUpstreamApiErrorDetail } from "@/utils/errors";

export type ChangePasswordRequiredError =
  | { kind: "invalidOldPassword" }
  // Correct old password, but the account doesn't currently need a change
  // (stale link, flag cleared elsewhere, ...). Distinct from
  // invalidOldPassword: credentials were fine, so the forgot-password
  // fallback would be the wrong next step to offer.
  | { kind: "notRequired" }
  | { kind: "policyViolation"; message: string | null }
  // Password WAS changed successfully — the BFF just couldn't log back in
  // and establish a session right after. Not a validation failure.
  | { kind: "changedButLoginFailed" }
  | { kind: "failed" };

/**
 * Classify POST /auth/change-password-required failures. The BFF route
 * (server/src/routes/auth/change-password-required.ts) forwards whichever
 * upstream call failed first: a 401/403 means the re-authentication step
 * (old password) was rejected; `{ error: "password_change_not_required" }`
 * (also 403) means credentials were fine but no change is needed; a 400/422
 * means the new password itself was rejected (policy);
 * `{ error: "login_after_change_failed" }` means the change succeeded but
 * the follow-up login/session-establishment didn't. Scoped to this endpoint
 * only — do not merge with classifyLoginError or classifyPasswordResetError,
 * which assign 403 different meanings for their own endpoints.
 */
export function classifyChangePasswordRequiredError(error: unknown): ChangePasswordRequiredError {
  if (!(error instanceof ApiError)) return { kind: "failed" };

  const body = error.body as { error?: string } | null;
  if (body?.error === "login_after_change_failed") return { kind: "changedButLoginFailed" };
  if (body?.error === "password_change_not_required") return { kind: "notRequired" };

  if (error.status === 401 || error.status === 403) return { kind: "invalidOldPassword" };

  if (error.status === 400 || error.status === 422) {
    return { kind: "policyViolation", message: extractUpstreamApiErrorDetail(error.body) };
  }

  return { kind: "failed" };
}
