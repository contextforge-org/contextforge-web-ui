import { ApiError } from "./client";
import { extractApiErrorDetail } from "@/utils/errors";

export type PasswordResetError =
  | { kind: "disabled" }
  | { kind: "expired" }
  | { kind: "badRequest"; message: string | null }
  | { kind: "rateLimited" }
  | { kind: "failed" };

/** Classify password-reset API failures in one place for both public auth screens. */
export function classifyPasswordResetError(error: unknown): PasswordResetError {
  if (!(error instanceof ApiError)) return { kind: "failed" };

  if (error.status === 403) return { kind: "disabled" };
  if (error.status === 410) return { kind: "expired" };
  if (error.status === 429) return { kind: "rateLimited" };

  if (error.status === 400) {
    return { kind: "badRequest", message: extractApiErrorDetail(error.body) };
  }

  return { kind: "failed" };
}
