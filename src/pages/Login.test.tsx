import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Login } from "./Login";
import { useAuth } from "../auth/useAuth";
import { useRouter, resolveNextParam } from "../router";
import { ApiError } from "../api/client";
import { I18nProvider } from "@/i18n";
import type { ReactElement } from "react";

// Mock hooks
vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../router", () => ({
  useRouter: vi.fn(),
  resolveNextParam: vi.fn(),
}));

function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("Login", () => {
  const mockNavigate = vi.fn();
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveNextParam).mockReturnValue("/app/");
    vi.mocked(useRouter).mockReturnValue({
      navigate: mockNavigate,
    } as unknown as ReturnType<typeof useRouter>);
  });

  it("redirects to /app/ if already authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      login: mockLogin,
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    expect(mockNavigate).toHaveBeenCalledWith("/app/");
  });

  it("renders login form correctly when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin,
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
  });

  it("handles successful login submission", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin.mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    expect(screen.getByRole("button", { name: /Signing in…/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test@example.com", "password123");
      expect(mockNavigate).toHaveBeenCalledWith("/app/");
    });
  });

  it("displays invalid credentials error on 401 ApiError", async () => {
    const error = new ApiError(401, "ApiError", "") as ApiError & { status?: number };
    error.status = 401;

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin.mockRejectedValue(error),
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "wrongpass" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials.");
    });
  });

  it("redirects to the password-change-required page on a 403 password-change-required response", async () => {
    const body = {
      error: "login_failed",
      detail: JSON.stringify({
        detail: "Password change required. Please change your password before continuing.",
      }),
    };
    const error = new ApiError(403, body, "HTTP 403");

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin.mockRejectedValue(error),
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "oldpass" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/app/change-password-required?email=test%40example.com",
      );
    });
  });

  it("displays the generic failed error for an unrelated 403", async () => {
    const body = { error: "login_failed", detail: JSON.stringify({ detail: "Forbidden" }) };
    const error = new ApiError(403, body, "HTTP 403");

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin.mockRejectedValue(error),
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pass" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Login failed (403).");
    });
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining("change-password-required"),
    );
  });

  it("displays generic failed error on non-401 ApiError", async () => {
    const error = new ApiError(500, "ApiError", "") as ApiError & { status?: number };
    error.status = 500;

    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin.mockRejectedValue(error),
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pass" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Login failed (500).");
    });
  });

  it("displays unexpected error on generic Error", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin.mockRejectedValue(new Error("Generic network error")),
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pass" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("An unexpected error occurred.");
    });
  });

  it("navigates to forgot password page when forgot password link is clicked", () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin,
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.click(screen.getByRole("button", { name: /Forgot password\?/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/app/forgot-password");
  });

  it("returns the user to the next destination after login", async () => {
    vi.mocked(resolveNextParam).mockReturnValue("/app/tools");
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      login: mockLogin.mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app/tools");
    });
  });

  it("returns an already-authenticated user to the next destination", () => {
    vi.mocked(resolveNextParam).mockReturnValue("/app/tools?page=2");
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      login: mockLogin,
    } as unknown as ReturnType<typeof useAuth>);

    renderWithI18n(<Login />);

    expect(mockNavigate).toHaveBeenCalledWith("/app/tools?page=2");
  });

  describe("SSO", () => {
    const originalPath = window.location.pathname + window.location.search;

    afterEach(() => {
      vi.unstubAllGlobals();
      window.history.replaceState(null, "", originalPath);
    });

    it("does not render an SSO button when ssoEnabled is false", () => {
      vi.mocked(useAuth).mockReturnValue({
        isAuthenticated: false,
        login: mockLogin,
        ssoEnabled: false,
      } as unknown as ReturnType<typeof useAuth>);

      renderWithI18n(<Login />);

      expect(screen.queryByRole("button", { name: /Sign in with/i })).not.toBeInTheDocument();
    });

    it("does not render an SSO button when ssoEnabled/ssoProviderName are absent (session not yet resolved)", () => {
      vi.mocked(useAuth).mockReturnValue({
        isAuthenticated: false,
        login: mockLogin,
      } as unknown as ReturnType<typeof useAuth>);

      renderWithI18n(<Login />);

      expect(screen.queryByRole("button", { name: /Sign in with/i })).not.toBeInTheDocument();
    });

    it("renders and navigates via a full-page redirect when SSO is enabled", () => {
      vi.mocked(useAuth).mockReturnValue({
        isAuthenticated: false,
        login: mockLogin,
        ssoEnabled: true,
        ssoProviderName: "Keycloak",
      } as unknown as ReturnType<typeof useAuth>);
      vi.stubGlobal("location", { ...window.location, href: "" });

      renderWithI18n(<Login />);

      const ssoButton = screen.getByRole("button", { name: /Sign in with Keycloak/i });
      fireEvent.click(ssoButton);

      expect(window.location.href).toBe("/auth/sso/login?next=%2Fapp%2F");
    });

    it("renders a visible error for an SSO callback failure without navigating further", async () => {
      vi.mocked(useAuth).mockReturnValue({
        isAuthenticated: false,
        login: mockLogin,
      } as unknown as ReturnType<typeof useAuth>);
      window.history.pushState({}, "", "/app/login?error=sso_access_denied");

      renderWithI18n(<Login />);

      expect(screen.getByRole("alert")).toHaveTextContent(/Single sign-on failed/i);
      expect(mockNavigate).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(window.location.search).toBe("");
      });
    });

    it("strips the error param but keeps other query params (e.g. next) intact", async () => {
      vi.mocked(useAuth).mockReturnValue({
        isAuthenticated: false,
        login: mockLogin,
      } as unknown as ReturnType<typeof useAuth>);
      window.history.pushState({}, "", "/app/login?next=%2Fapp%2Ftools&error=sso_access_denied");

      renderWithI18n(<Login />);

      await waitFor(() => {
        expect(window.location.search).toBe("?next=%2Fapp%2Ftools");
      });
    });
  });
});
