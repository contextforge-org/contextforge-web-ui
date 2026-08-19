import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuthContext, ApiError } from "./AuthContext";
import { useAuth } from "./useAuth";
import { api, setCsrfToken } from "../api/client";
import { permissionsApi } from "../api/permissions";

// Mock the API client
vi.mock("../api/client", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  return {
    api: {
      get: vi.fn(),
      post: vi.fn(),
    },
    ApiError: MockApiError,
    setCsrfToken: vi.fn(),
  };
});

// The permissions effect fires after authentication; mock it so it resolves
// deterministically and does not hit the (mocked) api.get for /auth/session.
vi.mock("../api/permissions", () => ({
  permissionsApi: { listMine: vi.fn().mockResolvedValue([]) },
}));

// Helper component to test context values
function TestComponent() {
  const auth = useAuthContext();
  if (auth.isLoading) {
    return <div data-testid="loading">Loading...</div>;
  }
  return (
    <div>
      <div data-testid="auth-status">{auth.isAuthenticated ? "authenticated" : "guest"}</div>
      {auth.user && <div data-testid="user-email">{auth.user.email}</div>}
      <button
        onClick={() => {
          // Real callers (Login.tsx) always catch this; swallow here too so a
          // rejected login in tests doesn't surface as an unhandled rejection.
          auth.login("test@example.com", "pass").catch(() => {});
        }}
      >
        Login
      </button>
      <button
        onClick={() => {
          auth
            .completePasswordChangeRequired("test@example.com", "old-pass", "new-pass")
            .catch(() => {});
        }}
      >
        CompletePasswordChangeRequired
      </button>
      <button onClick={() => auth.logout()}>Logout</button>
    </div>
  );
}

// Unlike TestComponent, doesn't gate the Login button behind isLoading — needed
// to trigger login() while the initial /auth/session call is still pending.
function RaceTestComponent() {
  const auth = useAuthContext();
  return (
    <div>
      <div data-testid="auth-status">{auth.isAuthenticated ? "authenticated" : "guest"}</div>
      {auth.user && <div data-testid="user-email">{auth.user.email}</div>}
      <button
        onClick={() => {
          auth.login("test@example.com", "pass").catch(() => {});
        }}
      >
        Login
      </button>
    </div>
  );
}

// Helper for useAuth re-export
function UseAuthTestComponent() {
  const auth = useAuth();
  return <div data-testid="reexport-status">{auth.isAuthenticated ? "yes" : "no"}</div>;
}

// Probe that reports permission state directly (not gated on loading) so a test
// can observe the fail-closed window.
function PermProbe() {
  const { hasPermission, permissionsLoading } = useAuth();
  return (
    <div>
      <div data-testid="perm-loading">{String(permissionsLoading)}</div>
      <div data-testid="perm-has">{String(hasPermission("tools.read"))}</div>
    </div>
  );
}

describe("AuthContext", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location
    delete (window as unknown as { location?: unknown }).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = { href: "" } as any;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = originalLocation as any;
  });

  it("throws error when useAuthContext is used outside AuthProvider", () => {
    // Suppress console.error for expected boundary throw
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow(
      "useAuthContext must be used inside <AuthProvider>",
    );
    consoleSpy.mockRestore();
  });

  it("handles successful initial authentication", async () => {
    const mockUser = {
      email: "user@example.com",
      full_name: "Test User",
      is_admin: true,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };

    vi.mocked(api.get).mockResolvedValueOnce({
      authenticated: true,
      user: mockUser,
      csrfToken: "session-csrf-token",
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    expect(screen.getByTestId("loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com");
    expect(api.get).toHaveBeenCalledWith("/auth/session");
    expect(setCsrfToken).toHaveBeenCalledWith("session-csrf-token");
  });

  it("treats an unauthenticated session response as a guest", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ authenticated: false });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    expect(screen.queryByTestId("user-email")).not.toBeInTheDocument();
    expect(setCsrfToken).toHaveBeenCalledWith(null);
  });

  it("handles failed initial authentication (401)", async () => {
    const error = new ApiError(401, "Unauthorized", "");
    vi.mocked(api.get).mockRejectedValueOnce(error);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    expect(screen.queryByTestId("user-email")).not.toBeInTheDocument();
  });

  it("handles failed initial authentication (generic error)", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Network Failure"));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
  });

  it("handles successful login", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(401, "Unauthorized", ""));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    const mockUser = {
      email: "user@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };

    vi.mocked(api.post).mockResolvedValueOnce({
      user: mockUser,
      csrfToken: "session-csrf-token",
    });

    screen.getByText("Login").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-email")).toHaveTextContent("user@example.com");
    });

    expect(api.post).toHaveBeenCalledWith(
      "/auth/login",
      { email: "test@example.com", password: "pass" },
      { authenticated: false },
    );
    expect(setCsrfToken).toHaveBeenCalledWith("session-csrf-token");
  });

  it("clears stale auth state and CSRF token when login fails", async () => {
    // Simulate a client that still holds a previously-authenticated state
    // (e.g. a stale session) when a login attempt is made and rejected.
    const mockUser = {
      email: "user@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };

    vi.mocked(api.get).mockResolvedValueOnce({
      authenticated: true,
      user: mockUser,
      csrfToken: "stale-csrf-token",
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    });

    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(401, "Unauthorized", ""));

    screen.getByText("Login").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    });

    expect(screen.queryByTestId("user-email")).not.toBeInTheDocument();
    expect(setCsrfToken).toHaveBeenLastCalledWith(null);
  });

  it("suppresses a stale pending /auth/session resolution after a failed login (authVersion race)", async () => {
    // The initial /auth/session check is still in flight when login() is
    // called and rejected; the session check's late resolution (reporting an
    // old, now-irrelevant authenticated user) must not overwrite the
    // failed-login state. The authVersion bump on login failure is what
    // guards this — see AuthContext.tsx's initial effect.
    const staleUser = {
      email: "stale@example.com",
      full_name: "Stale User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };
    let resolveSession!: (data: {
      authenticated: boolean;
      user?: typeof staleUser;
      csrfToken?: string;
    }) => void;
    const sessionPromise = new Promise<{
      authenticated: boolean;
      user?: typeof staleUser;
      csrfToken?: string;
    }>((resolve) => {
      resolveSession = resolve;
    });
    vi.mocked(api.get).mockReturnValueOnce(sessionPromise);

    render(
      <AuthProvider>
        <RaceTestComponent />
      </AuthProvider>,
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");

    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(401, "Unauthorized", ""));
    screen.getByText("Login").click();

    // Wait for the failed login's cleanup (which bumps authVersion) to run
    // before letting the still-pending initial session check resolve.
    await waitFor(() => expect(setCsrfToken).toHaveBeenCalledWith(null));

    resolveSession({ authenticated: true, user: staleUser, csrfToken: "stale-csrf-token" });

    // Give the now-stale resolution a tick to (not) take effect.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    expect(screen.queryByTestId("user-email")).not.toBeInTheDocument();
  });

  it("handles a successful completePasswordChangeRequired identically to login", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(401, "Unauthorized", ""));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    const mockUser = {
      email: "test@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };

    vi.mocked(api.post).mockResolvedValueOnce({
      user: mockUser,
      csrfToken: "test-csrf-token",
    });

    screen.getByText("CompletePasswordChangeRequired").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
      expect(screen.getByTestId("user-email")).toHaveTextContent("test@example.com");
    });

    expect(api.post).toHaveBeenCalledWith(
      "/auth/change-password-required",
      { email: "test@example.com", oldPassword: "old-pass", newPassword: "new-pass" },
      { authenticated: false },
    );
    expect(setCsrfToken).toHaveBeenCalledWith("test-csrf-token");
  });

  it("clears stale auth state and CSRF token when completePasswordChangeRequired fails", async () => {
    // Same scenario as login()'s equivalent test: a user reaches this
    // pre-auth page (bookmark, still-open tab) while still holding a
    // previously-authenticated state.
    const mockUser = {
      email: "user@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };

    vi.mocked(api.get).mockResolvedValueOnce({
      authenticated: true,
      user: mockUser,
      csrfToken: "stale-csrf-token",
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    });

    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(401, "Unauthorized", ""));

    screen.getByText("CompletePasswordChangeRequired").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
    });

    expect(screen.queryByTestId("user-email")).not.toBeInTheDocument();
    expect(setCsrfToken).toHaveBeenLastCalledWith(null);
  });

  it("handles successful logout", async () => {
    const mockUser = {
      email: "user@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };

    vi.mocked(api.get).mockResolvedValueOnce({
      authenticated: true,
      user: mockUser,
      csrfToken: "session-csrf-token",
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    vi.mocked(api.post).mockResolvedValueOnce({ ok: true });

    screen.getByText("Logout").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
      expect(window.location.href).toBe("/app/login");
    });

    expect(api.post).toHaveBeenCalledWith("/auth/logout", {});
    expect(setCsrfToken).toHaveBeenLastCalledWith(null);
  });

  it("handles logout server failure gracefully", async () => {
    const mockUser = {
      email: "user@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };

    vi.mocked(api.get).mockResolvedValueOnce({
      authenticated: true,
      user: mockUser,
      csrfToken: "session-csrf-token",
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("loading")).not.toBeInTheDocument();
    });

    vi.mocked(api.post).mockRejectedValueOnce(new Error("Server error"));

    screen.getByText("Logout").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("guest");
      expect(window.location.href).toBe("/app/login");
    });
  });

  it("fails closed: hasPermission is false while permissions are (re)loading", async () => {
    const mockUser = {
      email: "user@example.com",
      full_name: "Test User",
      is_admin: false,
      is_active: true,
      auth_provider: "local",
      email_verified: true,
      password_change_required: false,
    };
    vi.mocked(api.get).mockResolvedValueOnce({
      authenticated: true,
      user: mockUser,
      csrfToken: "session-csrf-token",
    });

    // Hold the permissions fetch open so we can observe the loading window.
    let resolvePerms!: (perms: string[]) => void;
    const permsPromise = new Promise<string[]>((resolve) => {
      resolvePerms = resolve;
    });
    vi.mocked(permissionsApi.listMine).mockReturnValueOnce(permsPromise);

    render(
      <AuthProvider>
        <PermProbe />
      </AuthProvider>,
    );

    // Auth has resolved but permissions are still in flight -> deny.
    await waitFor(() => expect(screen.getByTestId("perm-loading")).toHaveTextContent("true"));
    expect(screen.getByTestId("perm-has")).toHaveTextContent("false");

    // Once the permissions arrive, the grant applies.
    resolvePerms(["tools.read"]);
    await waitFor(() => expect(screen.getByTestId("perm-loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("perm-has")).toHaveTextContent("true");
  });

  it("re-exports useAuth correctly", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      authenticated: true,
      user: {
        email: "user@example.com",
        full_name: "Test User",
        is_admin: false,
        is_active: true,
        auth_provider: "local",
        email_verified: true,
        password_change_required: false,
      },
      csrfToken: "session-csrf-token",
    });

    render(
      <AuthProvider>
        <UseAuthTestComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("reexport-status")).toHaveTextContent("yes");
    });
  });
});
