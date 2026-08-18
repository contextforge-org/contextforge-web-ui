import { ApiError } from "./client";

export type LoginError =
  | { kind: "invalidCredentials" }
  | { kind: "passwordChangeRequired" }
  | { kind: "failed"; status: number };

interface UpstreamLoginErrorBody {
  error?: string;
  detail?: string;
}

const PASSWORD_CHANGE_REQUIRED_PATTERN = /password change required/i;

/**
 * server/src/routes/auth/login.ts forwards non-2xx upstream responses as
 * { error: "login_failed", detail: <raw upstream body text> }. When upstream's
 * body was JSON, `detail` here is itself a JSON-encoded string — parse
 * defensively, since other failures (e.g. a bare 429 rate-limit string) may
 * not be JSON at all.
 */
function extractUpstreamDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const envelope = body as UpstreamLoginErrorBody;
  if (typeof envelope.detail !== "string") return null;

  try {
    const inner = JSON.parse(envelope.detail) as { detail?: string };
    if (typeof inner.detail === "string") return inner.detail;
  } catch {
    // Not JSON — upstream sent plain text.
  }
  return envelope.detail;
}

/**
 * Classify POST /auth/login failures. Scoped to the login endpoint only —
 * do not merge with classifyPasswordResetError (./passwordResetErrors), which
 * assigns a different meaning to 403 for the password-reset-request flow.
 */
export function classifyLoginError(error: unknown): LoginError {
  if (!(error instanceof ApiError)) return { kind: "failed", status: 0 };
  if (error.status === 401) return { kind: "invalidCredentials" };

  if (error.status === 403) {
    const detail = extractUpstreamDetail(error.body);
    if (detail && PASSWORD_CHANGE_REQUIRED_PATTERN.test(detail)) {
      return { kind: "passwordChangeRequired" };
    }
  }

  return { kind: "failed", status: error.status };
}
