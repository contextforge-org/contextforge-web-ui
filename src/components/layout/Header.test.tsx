import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/test-utils";
import { Header } from "./Header";
import { useQuery } from "../../hooks/useQuery";
import { SidebarProvider } from "../ui/sidebar";

// Mock dependencies
vi.mock("../../hooks/useQuery", () => ({
  useQuery: vi.fn(),
}));

vi.mock("./HeaderQuickNav", () => ({
  HeaderQuickNav: () => <div data-testid="quick-nav" />,
}));

vi.mock("./HeaderProfileMenu", () => ({
  HeaderProfileMenu: () => <div data-testid="profile-menu" />,
}));

const openDialog = vi.fn();
let mockInvitationCount = 0;

vi.mock("../invitations/PendingInvitationsProvider", () => ({
  usePendingInvitations: () => ({
    count: mockInvitationCount,
    isLoading: false,
    error: null,
    open: openDialog,
    acceptedCount: 0,
    register: () => () => {},
  }),
}));

describe("Header", () => {
  const renderHeader = () => {
    return renderWithProviders(
      <SidebarProvider>
        <Header />
      </SidebarProvider>,
    );
  };

  it("always shows the UI's own package version", () => {
    vi.mocked(useQuery).mockReturnValue({ data: null } as unknown as ReturnType<typeof useQuery>);
    renderHeader();

    expect(screen.getByTestId("quick-nav")).toBeInTheDocument();
    expect(screen.getByTestId("profile-menu")).toBeInTheDocument();
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
  });

  it("shows supported and live API versions in the hover popover", async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({
      data: {
        app: {
          version: "1.0.0",
        },
      },
    } as unknown as ReturnType<typeof useQuery>);
    renderHeader();

    await user.hover(screen.getByText(`v${__APP_VERSION__}`));

    expect(await screen.findByText(`v${__SUPPORTED_API_VERSION__}`)).toBeInTheDocument();
    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
  });

  it("shows the live API version as unavailable when useQuery returns no data", async () => {
    const user = userEvent.setup();
    vi.mocked(useQuery).mockReturnValue({ data: null } as unknown as ReturnType<typeof useQuery>);
    renderHeader();

    await user.hover(screen.getByText(`v${__APP_VERSION__}`));

    expect(await screen.findByText("unavailable")).toBeInTheDocument();
  });
});

describe("Header pending invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvitationCount = 0;
    vi.mocked(useQuery).mockReturnValue({ data: null } as unknown as ReturnType<typeof useQuery>);
  });

  const renderHeader = () =>
    renderWithProviders(
      <SidebarProvider>
        <Header />
      </SidebarProvider>,
    );

  it("carries the badge, so every role can reach an invitation", () => {
    mockInvitationCount = 2;
    renderHeader();

    expect(screen.getByRole("button", { name: "2 team invitations" })).toBeInTheDocument();
  });

  it("renders no badge when nothing is pending", () => {
    renderHeader();

    expect(screen.queryByRole("button", { name: /invitation/ })).not.toBeInTheDocument();
  });

  it("places the badge ahead of the rest of the cluster", () => {
    mockInvitationCount = 1;
    renderHeader();

    const badge = screen.getByRole("button", { name: "1 team invitation" });
    expect(badge.nextElementSibling).toBe(screen.getByTestId("quick-nav"));
  });

  it("opens the shared dialog with no fallback focus target", async () => {
    const user = userEvent.setup();
    mockInvitationCount = 1;
    renderHeader();

    await user.click(screen.getByRole("button", { name: "1 team invitation" }));

    expect(openDialog).toHaveBeenCalledWith(undefined);
  });
});
