import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { resetPassword, validatePasswordResetToken } from "@/api/passwordReset";
import { I18nProvider } from "@/i18n";
import { useRouter } from "@/router";
import { ResetPassword } from "./ResetPassword";

vi.mock("@/api/passwordReset", () => ({
  resetPassword: vi.fn(),
  validatePasswordResetToken: vi.fn(),
}));
vi.mock("@/router", () => ({ useRouter: vi.fn() }));

describe("ResetPassword", () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ navigate } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(validatePasswordResetToken).mockResolvedValue({
      valid: true,
      message: "valid",
      expires_at: null,
    });
  });

  function renderPage(token = "reset/token") {
    return render(
      <I18nProvider>
        <ResetPassword token={token} />
      </I18nProvider>,
    );
  }

  async function fillPasswords(password: string, confirmation = password) {
    await waitFor(() => expect(document.getElementById("new-password")).toBeInTheDocument());
    fireEvent.change(document.getElementById("new-password")!, { target: { value: password } });
    fireEvent.change(document.getElementById("confirm-password")!, {
      target: { value: confirmation },
    });
  }

  it("validates route token before showing form", async () => {
    renderPage("safe-token");
    await waitFor(() =>
      expect(validatePasswordResetToken).toHaveBeenCalledWith(
        "safe-token",
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(document.getElementById("new-password")).toBeInTheDocument());
  });

  it("rejects mismatched passwords without API request", async () => {
    renderPage();
    await fillPasswords("Password-one1", "Password-two2");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(await screen.findAllByText("Passwords do not match.")).not.toHaveLength(0);
    expect(resetPassword).not.toHaveBeenCalled();

    fireEvent.change(document.getElementById("new-password")!, {
      target: { value: "Password-two2" },
    });
    expect(screen.queryAllByText("Passwords do not match.")).toHaveLength(0);
  });

  it("shows persistent success and waits for explicit login navigation", async () => {
    vi.mocked(resetPassword).mockResolvedValue({ success: true, message: "ok" });
    renderPage("reset/token");
    await fillPasswords("New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your password was changed for ContextForge.",
    );
    expect(resetPassword).toHaveBeenCalledWith("reset/token", "New-password1", "New-password1");
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Return to login" }));
    expect(navigate).toHaveBeenCalledWith("/app/login");
  });

  it("enforces minimum length and complexity before submission", async () => {
    renderPage();
    await fillPasswords("short-A1!");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByText("Password must be at least 12 characters.")).toBeInTheDocument();

    await fillPasswords("alllowercasepassword");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(
      await screen.findByText(
        "Password must contain at least 3 of: uppercase, lowercase, number, or special character.",
      ),
    ).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows backend password-policy detail without treating link as invalid", async () => {
    vi.mocked(resetPassword).mockRejectedValue(
      new ApiError(400, { detail: "Password must not be a commonly used password" }, "HTTP 400"),
    );
    renderPage();
    await fillPasswords("New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(
      await screen.findByText("Password must not be a commonly used password"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reset link is invalid/i)).not.toBeInTheDocument();
    expect(validatePasswordResetToken).toHaveBeenCalledTimes(2);
  });

  it("revalidates a failed submission to distinguish an invalid token from policy errors", async () => {
    vi.mocked(validatePasswordResetToken)
      .mockResolvedValueOnce({ valid: true, message: "valid", expires_at: null })
      .mockRejectedValueOnce(
        new ApiError(400, { detail: "El enlace ya no es válido" }, "HTTP 400"),
      );
    vi.mocked(resetPassword).mockRejectedValue(
      new ApiError(400, { detail: "Wording must not determine behavior" }, "HTTP 400"),
    );
    renderPage();
    await fillPasswords("New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This reset link is invalid or has already been used.",
    );
    expect(screen.getByRole("button", { name: "Request New Link" })).toBeInTheDocument();
    expect(validatePasswordResetToken).toHaveBeenCalledTimes(2);
  });

  it("offers new link for expired token without exposing token", async () => {
    vi.mocked(validatePasswordResetToken).mockRejectedValue(
      new ApiError(410, { detail: "expired reset/token" }, "HTTP 410"),
    );
    renderPage("secret-reset-token");

    expect(await screen.findByRole("alert")).toHaveTextContent("This reset link has expired.");
    expect(screen.queryByText(/secret-reset-token/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request New Link" }));
    expect(navigate).toHaveBeenCalledWith("/app/forgot-password");
  });

  it("does not encourage another reset request when token validation is rate limited", async () => {
    vi.mocked(validatePasswordResetToken).mockRejectedValue(
      new ApiError(429, { detail: "Too many requests" }, "HTTP 429"),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Please try again later.",
    );
    expect(screen.queryByRole("button", { name: "Request New Link" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to login" }));
    expect(navigate).toHaveBeenCalledWith("/app/login");
  });

  it("does not offer a dead-end reset request when password reset is disabled", async () => {
    vi.mocked(validatePasswordResetToken).mockRejectedValue(
      new ApiError(403, { detail: "Password reset is disabled" }, "HTTP 403"),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password reset is currently unavailable.",
    );
    expect(screen.queryByRole("button", { name: "Request New Link" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to login" })).toBeInTheDocument();
  });
});
