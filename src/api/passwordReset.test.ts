import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { requestPasswordReset, resetPassword, validatePasswordResetToken } from "./passwordReset";

vi.mock("./client", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

describe("passwordReset API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses public forgot-password endpoint", async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true, message: "ok" });
    await requestPasswordReset("person@example.com");
    expect(api.post).toHaveBeenCalledWith(
      "/auth/email/forgot-password",
      { email: "person@example.com" },
      { authenticated: false },
    );
  });

  it("URL-encodes token and validates without authentication", async () => {
    vi.mocked(api.get).mockResolvedValue({ valid: true, message: "ok", expires_at: null });
    const controller = new AbortController();
    await validatePasswordResetToken("token/with space", controller.signal);
    expect(api.get).toHaveBeenCalledWith(
      "/auth/email/reset-password/token%2Fwith%20space",
      undefined,
      controller.signal,
      { authenticated: false },
    );
  });

  it("submits matching password fields to public reset endpoint", async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true, message: "ok" });
    await resetPassword("token/one", "new-password", "new-password");
    expect(api.post).toHaveBeenCalledWith(
      "/auth/email/reset-password/token%2Fone",
      { new_password: "new-password", confirm_password: "new-password" },
      { authenticated: false },
    );
  });
});
