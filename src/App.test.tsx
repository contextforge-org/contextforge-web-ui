import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { renderWithProviders } from "./test/test-utils";

vi.mock("@/hooks/useQuery", () => ({
  useQuery: vi.fn(() => ({
    data: { servers: [] },
    error: null,
    isLoading: false,
    execute: vi.fn(),
    refetch: vi.fn(),
    setData: vi.fn(),
  })),
}));

describe("App", () => {
  it("shows the Suspense fallback while a route chunk is loading", async () => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/app/login");

    renderWithProviders(<App />);

    // First mount of the Login chunk: its Suspense fallback shows before
    // the lazy import resolves (later tests hit the cached module instead).
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("logs in and navigates to Gateways page via sidebar", async () => {
    const user = userEvent.setup();

    // Clear any existing auth
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/app/login");

    renderWithProviders(<App />);

    // Wait for login page to render
    await screen.findByRole("heading", { name: /sign in/i });

    // Fill in login form
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "password123");
    await user.click(submitButton);

    // Empty dashboard shows source onboarding after successful login
    await screen.findByRole("heading", { name: /connect a source/i });

    // Click on Virtual Servers in the sidebar
    const gatewaysLink = screen.getByRole("button", { name: /virtual servers/i });
    await user.click(gatewaysLink);

    // Verify Gateways page is displayed (empty state shows "Connect a source")
    const gatewaysHeading = await screen.findByRole("heading", {
      name: /Connect a source|Virtual servers/i,
    });
    expect(gatewaysHeading).toBeInTheDocument();
  });

  it("redirects bare /app to /app/", async () => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/app");

    renderWithProviders(<App />);

    // The bare /app path renders <Redirect to="/app/" />, which normalizes the URL.
    await waitFor(() => expect(window.location.pathname).toBe("/app/"));
  });

  it("navigates between separately-chunked public routes (login -> forgot password)", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/app/login");

    renderWithProviders(<App />);
    await screen.findByRole("heading", { name: /sign in/i });

    await user.click(screen.getByText(/forgot password/i));

    // Login's chunk unmounts and ForgotPassword's chunk loads in its place.
    await screen.findByRole("heading", { name: /forgot password/i });
    expect(screen.queryByRole("heading", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("mounts every stub private route's lazy chunk at least once", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    sessionStorage.clear();
    window.history.pushState({}, "", "/app/login");

    renderWithProviders(<App />);
    await screen.findByRole("heading", { name: /sign in/i });
    await user.type(screen.getByLabelText(/email address/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByRole("heading", { name: /connect a source/i });

    // These routes are plain placeholder pages (no network calls), so it's
    // safe to fly through all of them just to exercise their App.tsx lazy()
    // wrapper — the heavier pages already get their own dedicated tests.
    const stubRoutesAndHeadings: [string, RegExp][] = [
      ["/app/change-password", /change password/i],
      ["/app/agents", /agents/i],
      ["/app/rest-api", /rest api/i],
      ["/app/grpc", /grpc/i],
      ["/app/llm/providers", /llm providers/i],
      ["/app/llm/models", /llm models/i],
      ["/app/metrics", /metrics/i],
      ["/app/observability", /observability/i],
      ["/app/plugins", /plugins/i],
      ["/app/performance", /performance/i],
      ["/app/maintenance", /maintenance/i],
      ["/app/server-catalog", /server catalog/i],
      ["/app/not-found", /page not found\./i],
    ];

    for (const [route, heading] of stubRoutesAndHeadings) {
      window.history.pushState({}, "", route);
      window.dispatchEvent(new PopStateEvent("popstate"));
      await screen.findByText(heading);
    }
  });
});
