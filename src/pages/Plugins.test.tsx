import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PluginListResponse, PluginSummary } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { I18nProvider } from "@/i18n";
import { RouterProvider } from "@/router";
import { Plugins } from "./Plugins";

vi.mock("@/hooks/useQuery", () => ({
  useQuery: vi.fn(),
}));

const mockUseQuery = vi.mocked(useQuery);

const guardrails: PluginSummary = {
  name: "PII Guardrails",
  description: "Detects and redacts personally identifiable information",
  author: "ContextForge",
  version: "1.2.0",
  mode: "enforce",
  priority: 10,
  hooks: ["tool_pre_invoke", "tool_post_invoke"],
  tags: ["security", "compliance"],
  status: "enabled",
  config_summary: { redact: true, threshold: 0.8, entities: ["EMAIL", "SSN"] },
};

const logging: PluginSummary = {
  name: "Request Logger",
  description: "Logs request and response payloads for auditing",
  author: "Community",
  version: "0.4.1",
  mode: "disabled",
  priority: 50,
  hooks: ["http_pre_request"],
  tags: ["observability"],
  status: "disabled",
};

const response: PluginListResponse = {
  plugins_globally_enabled: true,
  plugins: [guardrails, logging],
  total: 2,
  enabled_count: 1,
  disabled_count: 1,
};

function queryResult(overrides: Partial<ReturnType<typeof useQuery>> = {}) {
  return {
    data: response,
    error: null,
    isLoading: false,
    execute: vi.fn(),
    refetch: vi.fn(),
    setData: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useQuery>;
}

function renderWithRouter(ui: ReactElement, path = "/app/plugins") {
  window.history.pushState({}, "", path);
  return render(
    <RouterProvider>
      <I18nProvider>{ui}</I18nProvider>
    </RouterProvider>,
  );
}

describe("Plugins", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/app/");
    mockUseQuery.mockReturnValue(queryResult());
  });

  it("uses the plugins GET endpoint and shared loader", () => {
    mockUseQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

    renderWithRouter(<Plugins />);

    expect(mockUseQuery).toHaveBeenCalledWith("/v1/plugins");
    expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
  });

  it("renders plugin cards with status", () => {
    renderWithRouter(<Plugins />);

    expect(screen.getByRole("region", { name: "Plugins" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Catalog plugins" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "PII Guardrails" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Request Logger" })).toBeInTheDocument();
    expect(within(list).getByText("Enabled")).toBeInTheDocument();
    expect(within(list).getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 plugins shown");
  });

  it("opens a read-only plugin details dialog with configuration", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Plugins />);

    await user.click(screen.getByRole("button", { name: "View PII Guardrails" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "PII Guardrails" })).toBeInTheDocument();
    expect(within(dialog).getByText("ContextForge")).toBeInTheDocument();
    expect(within(dialog).getByText("enforce")).toBeInTheDocument();
    expect(within(dialog).getByText("tool_pre_invoke")).toBeInTheDocument();
    expect(within(dialog).getByText("security")).toBeInTheDocument();
    expect(within(dialog).getByText("redact")).toBeInTheDocument();
    expect(within(dialog).getByText("true")).toBeInTheDocument();
    expect(within(dialog).getByText('["EMAIL","SSN"]')).toBeInTheDocument();
    // Status is derived from mode (status === "disabled" iff mode === "disabled"),
    // so the dialog shows mode only.
    expect(within(dialog).queryByText("Status")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "View PII Guardrails" })).toHaveFocus(),
    );
  });

  it("restores search and enabled-only state from the URL", () => {
    renderWithRouter(<Plugins />, "/app/plugins?search=logger&status=enabled");

    expect(screen.getByRole("button", { name: "Enabled" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox", { name: "Search plugins" })).toHaveValue("logger");
    expect(screen.getByText("No plugins match the active search and filters.")).toBeInTheDocument();
  });

  it("filters by mode and reflects it in the URL", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Plugins />);

    await user.click(screen.getByRole("button", { name: /^Filters$/ }));
    await user.click(screen.getByRole("combobox", { name: "Mode" }));
    await user.click(screen.getByRole("option", { name: "enforce" }));

    await waitFor(() => expect(window.location.search).toContain("mode=enforce"));
    expect(screen.getByRole("heading", { name: "PII Guardrails" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Request Logger" })).not.toBeInTheDocument();
  });

  it("does not offer 'disabled' as a mode option", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Plugins />);

    await user.click(screen.getByRole("button", { name: /^Filters$/ }));
    await user.click(screen.getByRole("combobox", { name: "Mode" }));

    expect(screen.getByRole("option", { name: "enforce" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "disabled" })).not.toBeInTheDocument();
  });

  it("ignores mode=disabled from the URL", () => {
    renderWithRouter(<Plugins />, "/app/plugins?mode=disabled");

    expect(screen.getByRole("heading", { name: "PII Guardrails" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Request Logger" })).toBeInTheDocument();
    // Accessible name stays "Filters" (not "Filters, 1 active") — the ignored
    // mode must not count towards the active filter badge.
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
  });

  it("filters by hook and tag, then clears filters", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Plugins />);

    await user.click(screen.getByRole("button", { name: /^Filters$/ }));
    await user.click(screen.getByRole("combobox", { name: "Hook" }));
    await user.click(screen.getByRole("option", { name: "http_pre_request" }));

    let params = new URLSearchParams(window.location.search);
    expect(params.get("hook")).toBe("http_pre_request");
    expect(screen.getByRole("heading", { name: "Request Logger" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PII Guardrails" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "security" }));

    params = new URLSearchParams(window.location.search);
    expect(params.getAll("tags")).toContain("security");
    expect(screen.getByText("No plugins match the active search and filters.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));

    params = new URLSearchParams(window.location.search);
    expect(params.has("hook")).toBe(false);
    expect(params.has("tags")).toBe(false);
    expect(screen.getByRole("heading", { name: "PII Guardrails" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Request Logger" })).toBeInTheDocument();
  });

  it("updates URL state while typing a search and can toggle back to all", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Plugins />);
    const replaceState = vi.spyOn(window.history, "replaceState");

    await user.type(screen.getByRole("searchbox", { name: "Search plugins" }), "logger");
    expect(screen.getByRole("heading", { name: "Request Logger" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PII Guardrails" })).not.toBeInTheDocument();

    await waitFor(() => expect(window.location.search).toContain("search=logger"));
    expect(replaceState).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Enabled" }));
    expect(screen.getByRole("button", { name: "Enabled" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).not.toContain("status=enabled");

    replaceState.mockRestore();
  });

  it("shows a banner when the plugin subsystem is globally disabled", () => {
    mockUseQuery.mockReturnValue(
      queryResult({ data: { plugins_globally_enabled: false, plugins: [], total: 0 } }),
    );

    renderWithRouter(<Plugins />);

    expect(
      screen.getByText(
        "The plugin subsystem is disabled for this gateway. Enable it in the gateway configuration to view registered plugins.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("shows a generic error state with retry", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(response);
    mockUseQuery.mockReturnValue(
      queryResult({ data: undefined, error: { message: "HTTP 500", status: 500 }, refetch }),
    );

    renderWithRouter(<Plugins />);

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load plugins. Try again.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows an empty state when no plugins are registered", () => {
    mockUseQuery.mockReturnValue(
      queryResult({ data: { plugins_globally_enabled: true, plugins: [], total: 0 } }),
    );

    renderWithRouter(<Plugins />);

    expect(screen.getByText("No plugins are registered on this gateway.")).toBeInTheDocument();
  });

  it("shows a dedicated empty state when no plugins are enabled", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue(
      queryResult({ data: { ...response, plugins: [logging], total: 1 } }),
    );

    renderWithRouter(<Plugins />);
    await user.click(screen.getByRole("button", { name: "Enabled" }));

    expect(screen.getByText("No plugins are currently enabled.")).toBeInTheDocument();
    expect(
      screen.queryByText("No plugins match the active search and filters."),
    ).not.toBeInTheDocument();
  });
});
