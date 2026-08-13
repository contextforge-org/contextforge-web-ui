import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { requestPasswordReset } from "@/api/passwordReset";
import { I18nProvider } from "@/i18n";
import { useRouter } from "@/router";
import { ForgotPassword } from "./ForgotPassword";

vi.mock("@/api/passwordReset", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("@/router", () => ({ useRouter: vi.fn() }));

describe("ForgotPassword", () => {
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ navigate } as unknown as ReturnType<typeof useRouter>);
  });

  function renderPage() {
    return render(
      <I18nProvider>
        <ForgotPassword />
      </I18nProvider>,
    );
  }

  it("submits email and shows persistent generic success state", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ success: true, message: "ok" });
    renderPage();

    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "person@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith("person@example.com"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "If this email is registered, you will receive a reset link.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to login only after user clicks success action", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ success: true, message: "ok" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "person@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Back to Sign In" }));
    expect(navigate).toHaveBeenCalledWith("/app/login");
  });

  it("shows accessible rate-limit error", async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(
      new ApiError(429, { detail: "Too many requests" }, "HTTP 429"),
    );
    renderPage();
    const input = screen.getByLabelText("Email Address");
    fireEvent.change(input, { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many requests. Please try again later.",
    );
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("validates email before calling API", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});
