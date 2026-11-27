/**
 * Reads the HTTP status off an API failure. Structural on purpose: useQuery
 * sanitizes thrown ApiErrors into plain `{ message, status, ... }` objects, so
 * an instanceof test would never match a query error. Matches both shapes.
 */
export function apiErrorStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const { status } = err as { status: unknown };
  return typeof status === "number" ? status : undefined;
}

/** True when an error is a 403 from the API. */
export function isPermissionDenied(err: unknown): boolean {
  return apiErrorStatus(err) === 403;
}

/**
 * Wrapper for async operations with standardized error handling
 *
 * @param operation - The async operation to execute
 * @param errorMessage - Context message for logging
 * @returns The operation result or null on error
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string,
): Promise<T | null> {
  try {
    return await operation();
  } catch (err) {
    const sanitized = sanitizeError(err);
    console.error(errorMessage, sanitized);
    return null;
  }
}

/**
 * Extracts error message from FastAPI validation error format
 *
 * @param body - The error body from API response
 * @returns Extracted error message or null if not found
 */
export function extractApiErrorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const errorBody = body as {
    detail?: string | Array<{ msg: string }> | { error?: string; message?: string };
  };

  if (!errorBody.detail) {
    return null;
  }

  // String detail
  if (typeof errorBody.detail === "string") {
    return errorBody.detail;
  }

  // Object detail such as the A2A test failure: { success, error, error_type, agent_id }
  if (!Array.isArray(errorBody.detail) && typeof errorBody.detail === "object") {
    const { error, message } = errorBody.detail;
    if (typeof error === "string" && error) return error;
    if (typeof message === "string" && message) return message;
    return null;
  }

  // Array of validation errors
  if (Array.isArray(errorBody.detail) && errorBody.detail.length > 0) {
    return errorBody.detail[0].msg || null;
  }

  return null;
}

/**
 * Extracts `detail.error_type` from a failure body such as the one
 * `POST /v1/a2a/{id}/test` returns, or null when the body has none.
 *
 * @param body - The error body from API response
 * @returns The error classification or null if not found
 */
export function extractApiErrorType(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const type = (detail as { error_type?: unknown }).error_type;
  return typeof type === "string" && type ? type : null;
}

/**
 * Extracts the real error message from a BFF-owned auth route's forwarded
 * failure envelope. Routes like server/src/routes/auth/login.ts and
 * change-password-required.ts forward a rejected upstream response as
 * `{ error: <bff-error-code>, detail: <raw upstream response TEXT> }` — when
 * upstream's body was JSON, `detail` here is itself a JSON-encoded string, so
 * naively treating it as the message (extractApiErrorDetail's usual contract)
 * renders the raw JSON text. Parse it defensively: other failures (e.g. a
 * bare rate-limit string) may not be JSON at all, in which case `detail` IS
 * already the message.
 *
 * @param body - The error body from a BFF-owned auth route's ApiError
 * @returns Extracted error message or null if not found
 */
export function extractUpstreamApiErrorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const envelope = body as { detail?: string };
  if (typeof envelope.detail !== "string") return null;

  try {
    const inner = extractApiErrorDetail(JSON.parse(envelope.detail));
    if (inner) return inner;
  } catch {
    // Not JSON — upstream sent plain text, `detail` is already the message.
  }
  return envelope.detail;
}

/**
 * Sanitizes error messages to prevent information leakage
 *
 * @param err - The error object to sanitize
 * @returns A safe, user-friendly error message
 */
export function sanitizeError(err: unknown): string {
  // Log full error for debugging in development
  if (import.meta.env.DEV) {
    console.error("[DEV] Full error:", err);
  }

  // ApiError carries the parsed response body plus the HTTP status.
  if (err && typeof err === "object" && "body" in err && "status" in err) {
    const apiErr = err as { status: number; body: unknown };

    // Well-known auth/availability statuses get a consistent, friendly message.
    // The backend detail for these is typically terse (e.g. "Forbidden") and not
    // actionable, so the status-based message takes precedence.
    if (apiErr.status === 401) return "Authentication required. Please log in again.";
    if (apiErr.status === 403) return "You don't have permission to perform this action.";
    if (apiErr.status === 404) return "The requested resource was not found.";
    if (apiErr.status >= 500) return "Server error. Please try again later.";

    // For other statuses (e.g. 400/409/422) the backend detail is the most
    // actionable message (e.g. "User is already a member"), so surface it as-is.
    const detail = extractApiErrorDetail(apiErr.body);
    if (detail) return detail;

    return "An error occurred. Please try again.";
  }

  if (err instanceof Error) {
    const message = err.message.toLowerCase();

    // Network errors
    if (message.includes("network") || message.includes("timeout") || message.includes("fetch")) {
      return "Network error. Please check your connection and try again.";
    }

    // Authentication errors
    if (message.includes("401") || message.includes("unauthorized")) {
      return "Authentication required. Please log in again.";
    }

    // Permission errors
    if (message.includes("403") || message.includes("forbidden")) {
      return "You don't have permission to perform this action.";
    }

    // Not found errors
    if (message.includes("404") || message.includes("not found")) {
      return "The requested resource was not found.";
    }

    // Server errors
    if (message.includes("500") || message.includes("502") || message.includes("503")) {
      return "Server error. Please try again later.";
    }

    // Log unmatched errors for monitoring
    console.warn("[Security] Unmatched error type:", err.constructor.name);

    // Generic fallback - don't expose raw error messages
    return "An error occurred. Please try again.";
  }

  return "An unexpected error occurred.";
}

/** Detail the API returns (404) when a referenced user does not exist. */
export const USER_NOT_FOUND_DETAIL = "User not found";
