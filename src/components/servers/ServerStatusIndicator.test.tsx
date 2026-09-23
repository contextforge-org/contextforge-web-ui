import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "@/test/test-utils";
import type { OAuthTokenStatus } from "@/api/oauth";
import { ServerStatusIndicator } from "./ServerStatusIndicator";

const server = { name: "github-notify", enabled: true, reachable: true };
const readyOAuthStatus = (tokenStatus: OAuthTokenStatus) => ({
  state: "ready" as const,
  status: {
    oauth_enabled: true,
    grant_type: "authorization_code",
    user_token_status: { status: tokenStatus, authorized: tokenStatus === "valid" },
  },
  tokenStatus,
});

describe("ServerStatusIndicator", () => {
  it("explains a state with nothing to resolve, in a popover", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServerStatusIndicator
        server={{
          ...server,
          reachable: false,
          lastSeen: "2026-04-16T13:23:12Z",
          lastError: "connection refused",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /status: Offline/i }));

    expect(await screen.findByText(/This server is offline/)).toBeInTheDocument();
    expect(screen.getByText(/connection refused/)).toBeInTheDocument();
    expect(screen.getByText(/Last response:/)).toBeInTheDocument();
  });

  it("omits last response and last error when the server has neither", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ServerStatusIndicator server={{ ...server, reachable: false }} />);

    await user.click(screen.getByRole("button", { name: /status: Connecting/i }));

    expect(await screen.findByText(/not active yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Last error:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last response:/)).not.toBeInTheDocument();
  });

  it("withholds the stale last error an inactive server kept from its last outage", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServerStatusIndicator
        server={{
          ...server,
          enabled: false,
          reachable: false,
          lastSeen: "2026-04-16T13:23:12Z",
          lastError: "certificate has expired",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /status: Inactive/i }));

    expect(await screen.findByText(/are inactive/)).toBeInTheDocument();
    expect(screen.getByText(/Last response:/)).toBeInTheDocument();
    expect(screen.queryByText(/certificate has expired/)).not.toBeInTheDocument();
  });

  it("withholds it from a disabled server whose token has also expired", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServerStatusIndicator
        server={{
          ...server,
          enabled: false,
          reachable: false,
          lastSeen: "2026-04-16T13:23:12Z",
          lastError: "certificate has expired",
        }}
        oauthStatus={readyOAuthStatus("expired")}
      />,
    );

    await user.click(screen.getByRole("button", { name: /status: Authorization expired/i }));

    expect(await screen.findByText(/authorization has expired/)).toBeInTheDocument();
    expect(screen.queryByText(/certificate has expired/)).not.toBeInTheDocument();
  });

  it("hands authorization straight to the OAuth flow", async () => {
    const user = userEvent.setup();
    const onAuthorize = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ServerStatusIndicator
        server={server}
        oauthStatus={readyOAuthStatus("missing")}
        onAuthorize={onAuthorize}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Authorize github-notify" }));

    expect(onAuthorize).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains the auth state where the caller cannot authorize", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ServerStatusIndicator server={server} oauthStatus={readyOAuthStatus("missing")} />,
    );

    await user.click(screen.getByRole("button", { name: /status: Authorization required/i }));

    expect(await screen.findByText(/You have not authorized this server/)).toBeInTheDocument();
  });

  it("holds the pending label while the flow is open", async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const onAuthorize = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    renderWithProviders(
      <ServerStatusIndicator
        server={server}
        oauthStatus={readyOAuthStatus("missing")}
        onAuthorize={onAuthorize}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Authorize github-notify" }));

    const trigger = screen.getByRole("button", { name: "Authorize github-notify" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("Authorizing...");
    expect(screen.getByText("Authorization required")).toHaveAttribute("aria-hidden", "true");

    release?.();
  });

  it("announces the full status word where the label is abbreviated", () => {
    renderWithProviders(
      <ServerStatusIndicator server={server} oauthStatus={readyOAuthStatus("missing")} compact />,
    );

    expect(screen.getByText("Auth")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.getByRole("button", {
        name: "github-notify status: Authorization required. Show details",
      }),
    ).toBeInTheDocument();
  });

  it("renders as plain text where a button cannot nest", () => {
    renderWithProviders(<ServerStatusIndicator server={server} interactive={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
