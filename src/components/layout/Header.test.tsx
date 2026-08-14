import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

describe("Header", () => {
  const renderHeader = () => {
    return render(
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
