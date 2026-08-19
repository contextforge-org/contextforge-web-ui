import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { I18nProvider } from "@/i18n";
import { useAuth } from "@/auth/useAuth";
import { useRouter, resolveNextParam } from "@/router";
import { PasswordChangeRequired } from "./PasswordChangeRequired";

vi.mock("@/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/router", () => ({ useRouter: vi.fn(), resolveNextParam: vi.fn() }));

describe("PasswordChangeRequired", () => {
  const navigate = vi.fn();
  const completePasswordChangeRequired = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ navigate } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(resolveNextParam).mockReturnValue("/app/");
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      completePasswordChangeRequired,
    } as unknown as ReturnType<typeof useAuth>);
    window.history.pushState({}, "", "/app/change-password-required?email=user%40example.com");
  });

  function renderPage() {
    return render(
      <I18nProvider>
        <PasswordChangeRequired />
      </I18nProvider>,
    );
  }

  async function fillPasswords(
    oldPassword: string,
    newPassword: string,
    confirmation = newPassword,
  ) {
    await waitFor(() => expect(document.getElementById("old-password")).toBeInTheDocument());
    fireEvent.change(document.getElementById("old-password")!, { target: { value: oldPassword } });
    fireEvent.change(document.getElementById("new-password")!, { target: { value: newPassword } });
    fireEvent.change(document.getElementById("confirm-password")!, {
      target: { value: confirmation },
    });
  }

  it("pre-fills the read-only email from the query param", () => {
    renderPage();
    expect(screen.getByLabelText("Email Address")).toHaveValue("user@example.com");
    expect(screen.getByLabelText("Email Address")).toBeDisabled();
  });

  it("redirects into the app if already authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      completePasswordChangeRequired,
    } as unknown as ReturnType<typeof useAuth>);

    renderPage();
    expect(navigate).toHaveBeenCalledWith("/app/");
  });

  it("rejects mismatched new passwords without an API request", async () => {
    renderPage();
    await fillPasswords("old-pass", "New-password1", "New-password2");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(completePasswordChangeRequired).not.toHaveBeenCalled();
  });

  it("enforces minimum length and complexity before submission", async () => {
    renderPage();
    await fillPasswords("old-pass", "short-A1!");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(await screen.findByText("Password must be at least 12 characters.")).toBeInTheDocument();

    await fillPasswords("old-pass", "alllowercasepassword");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(
      await screen.findByText(
        "Password must contain at least 3 of: uppercase, lowercase, number, or special character.",
      ),
    ).toBeInTheDocument();
    expect(completePasswordChangeRequired).not.toHaveBeenCalled();
  });

  it("on success, calls AuthContext and navigates straight into the app (no static success screen)", async () => {
    completePasswordChangeRequired.mockResolvedValue(undefined);
    renderPage();
    await fillPasswords("old-pass", "New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    await waitFor(() => {
      expect(completePasswordChangeRequired).toHaveBeenCalledWith(
        "user@example.com",
        "old-pass",
        "New-password1",
      );
    });
    // No local success screen is rendered — AuthContext's own state flip
    // (isAuthenticated: true on next render) is what drives navigation.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an invalid-old-password message with a forgot-password fallback", async () => {
    completePasswordChangeRequired.mockRejectedValue(new ApiError(401, null, "HTTP 401"));
    renderPage();
    await fillPasswords("wrong-old-pass", "New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/current password is incorrect/i);
    const fallback = screen.getByRole("button", { name: /forgot your password/i });
    fireEvent.click(fallback);
    expect(navigate).toHaveBeenCalledWith("/app/forgot-password");
  });

  it("surfaces a backend policy-violation message on the new password field", async () => {
    completePasswordChangeRequired.mockRejectedValue(
      new ApiError(400, { detail: "Password must not be a commonly used password" }, "HTTP 400"),
    );
    renderPage();
    await fillPasswords("old-pass", "New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(
      await screen.findByText("Password must not be a commonly used password"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /forgot your password/i })).not.toBeInTheDocument();
  });

  it("shows a distinct message with a return-to-login fallback when the account doesn't need a change (correct credentials)", async () => {
    completePasswordChangeRequired.mockRejectedValue(
      new ApiError(403, { error: "password_change_not_required" }, "HTTP 403"),
    );
    renderPage();
    await fillPasswords("old-pass", "New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/doesn't need to be changed/i);
    // Not the "wrong password" copy, and no forgot-password offer — the
    // credentials were correct.
    expect(alert).not.toHaveTextContent(/current password is incorrect/i);
    expect(screen.queryByRole("button", { name: /forgot your password/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Return to login" }));
    expect(navigate).toHaveBeenCalledWith("/app/login");
  });

  it("shows an error and a return-to-login CTA instead of a submittable form when ?email= is missing", () => {
    window.history.pushState({}, "", "/app/change-password-required");
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't tell which account/i);
    expect(document.getElementById("old-password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Return to login" }));
    expect(navigate).toHaveBeenCalledWith("/app/login");
  });

  it("shows the fallback success screen when the password changed but auto sign-in failed", async () => {
    completePasswordChangeRequired.mockRejectedValue(
      new ApiError(502, { error: "login_after_change_failed" }, "HTTP 502"),
    );
    renderPage();
    await fillPasswords("old-pass", "New-password1");
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
    fireEvent.click(screen.getByRole("button", { name: "Return to login" }));
    expect(navigate).toHaveBeenCalledWith("/app/login");
  });
});
