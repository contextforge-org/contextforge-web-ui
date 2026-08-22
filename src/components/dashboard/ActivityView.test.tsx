import { describe, expect, it, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/react";

import { ApiError } from "@/api/client";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import { renderWithProviders } from "@/test/test-utils";
import type { ActivityItem } from "@/types/activity";

import { ActivityView } from "./ActivityView";

vi.mock("@/hooks/useRecentActivity", () => ({ useRecentActivity: vi.fn() }));

const mockUseRecentActivity = vi.mocked(useRecentActivity);

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: "audit:1",
    timestamp: "2026-08-21T12:00:00Z",
    source: "audit",
    title: "MCP server registered",
    description: "A new MCP server github-tools was registered.",
    status: "success",
    resource_type: "mcp_server",
    resource_name: "github-tools",
    actor: "alice@acme.io",
    correlation_id: "a1b2c3d4",
    ...over,
  };
}

function feed(items: ActivityItem[], over: { isLoading?: boolean; error?: Error | null } = {}) {
  mockUseRecentActivity.mockReturnValue({
    items,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...over,
  });
}

const ITEMS = [
  item({ id: "audit:1", title: "MCP server registered", status: "success" }),
  item({
    id: "audit:2",
    title: "Tool invoked",
    description: "Tool search ran for 120ms.",
    status: "info",
    resource_name: "search",
  }),
  item({
    id: "sec:1",
    title: "Rate limit reached",
    description: "Threshold hit for payments.",
    status: "warning",
    resource_name: "payments",
  }),
  item({
    id: "sec:2",
    title: "Health check failed",
    description: "billing stopped responding.",
    status: "error",
    resource_name: "billing",
  }),
  item({
    id: "sec:3",
    title: "Auth failure",
    description: "Rejected credentials for billing.",
    status: "error",
    resource_name: "billing",
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ActivityView", () => {
  it("renders a row per item with its server-rendered title and description", () => {
    feed(ITEMS);
    renderWithProviders(<ActivityView />);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("MCP server registered")).toBeInTheDocument();
    expect(screen.getByText("A new MCP server github-tools was registered.")).toBeInTheDocument();
  });

  it("renders relative timestamps and keeps the absolute ISO value for hover", () => {
    feed([item({ timestamp: "2026-08-21T12:00:00Z" })]);
    renderWithProviders(<ActivityView />);

    const time = screen.getByRole("listitem").querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-08-21T12:00:00Z");
    expect(time).toHaveAttribute("title", "2026-08-21T12:00:00Z");
    expect(time?.textContent).toMatch(/ago|now/);
  });

  it("exposes the status to assistive tech as text, not just an icon", () => {
    feed([item({ status: "error" })]);
    renderWithProviders(<ActivityView />);

    expect(within(screen.getByRole("listitem")).getByText("Error")).toBeInTheDocument();
  });

  it("counts errors and warnings on the filter tabs, and info only under All", () => {
    feed(ITEMS);
    renderWithProviders(<ActivityView />);

    expect(screen.getByRole("tab", { name: "All activity" })).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Errors/ })).getByText("2")).toBeVisible();
    expect(within(screen.getByRole("tab", { name: /Warnings/ })).getByText("1")).toBeVisible();
    expect(screen.queryByRole("tab", { name: /Info/ })).not.toBeInTheDocument();
  });

  it("narrows the list to the selected severity", async () => {
    feed(ITEMS);
    renderWithProviders(<ActivityView />);

    await userEvent.click(screen.getByRole("tab", { name: /Errors/ }));

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Health check failed")).toBeInTheDocument();
    expect(screen.queryByText("MCP server registered")).not.toBeInTheDocument();
  });

  it("searches the fetched feed across title, description, resource and actor", async () => {
    feed(ITEMS);
    renderWithProviders(<ActivityView />);

    await userEvent.type(screen.getByRole("searchbox"), "billing");

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Health check failed")).toBeInTheDocument();
  });

  it("distinguishes an empty feed from an empty filter result", async () => {
    feed(ITEMS);
    const { rerender } = renderWithProviders(<ActivityView />);

    await userEvent.type(screen.getByRole("searchbox"), "nothing-matches-this");
    expect(screen.getByText("No activity matches your filters.")).toBeInTheDocument();

    feed([]);
    rerender(<ActivityView />);
    expect(screen.getByText("No recent activity.")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("renders PermissionDenied when the server 403s despite the page gate", () => {
    feed([], { error: new ApiError(403, {}, "Forbidden") });
    renderWithProviders(<ActivityView />);

    expect(screen.getByText("You do not have permission to view this.")).toBeInTheDocument();
  });

  it("renders generic copy for a non-403 failure, never the raw server message", () => {
    feed([], { error: new ApiError(500, {}, "psycopg2.OperationalError: connection refused") });
    renderWithProviders(<ActivityView />);

    expect(screen.getByText("Recent activity could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText(/psycopg2/)).not.toBeInTheDocument();
  });

  it("shows a skeleton while the first fetch is in flight", () => {
    feed([], { isLoading: true });
    const { container } = renderWithProviders(<ActivityView />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
