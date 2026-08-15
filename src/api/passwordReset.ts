import { api } from "./client";

interface SuccessResponse {
  success: boolean;
  message: string;
}

export interface PasswordResetTokenValidationResponse {
  valid: boolean;
  message: string;
  expires_at: string | null;
}

const resetPath = (token: string) => `/auth/email/reset-password/${encodeURIComponent(token)}`;

export function requestPasswordReset(email: string): Promise<SuccessResponse> {
  return api.post<SuccessResponse>(
    "/auth/email/forgot-password",
    { email },
    { authenticated: false },
  );
}

export function validatePasswordResetToken(
  token: string,
  signal?: AbortSignal,
): Promise<PasswordResetTokenValidationResponse> {
  return api.get<PasswordResetTokenValidationResponse>(resetPath(token), undefined, signal, {
    authenticated: false,
  });
}

export function resetPassword(
  token: string,
  newPassword: string,
  confirmPassword: string,
): Promise<SuccessResponse> {
  return api.post<SuccessResponse>(
    resetPath(token),
    { new_password: newPassword, confirm_password: confirmPassword },
    { authenticated: false },
  );
}
