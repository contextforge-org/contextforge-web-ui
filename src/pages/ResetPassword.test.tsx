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
    await fillPasswords("password-one", "password-two");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(await screen.findAllByText("Passwords do not match.")).not.toHaveLength(0);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows persistent success and waits for explicit login navigation", async () => {
    vi.mocked(resetPassword).mockResolvedValue({ success: true, message: "ok" });
    renderPage("reset/token");
    await fillPasswords("new-password");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your password was changed for ContextForge.",
    );
    expect(resetPassword).toHaveBeenCalledWith("reset/token", "new-password", "new-password");
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Return to login" }));
    expect(navigate).toHaveBeenCalledWith("/app/login");
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
});
