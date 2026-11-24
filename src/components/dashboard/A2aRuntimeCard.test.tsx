import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { useA2aMetrics, type UseA2aMetricsResult } from "@/hooks/useA2aMetrics";
import { renderWithProviders } from "@/test/test-utils";

import { A2aRuntimeCard } from "./A2aRuntimeCard";

vi.mock("@/hooks/useA2aMetrics", () => ({ useA2aMetrics: vi.fn() }));
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ hasPermission: () => false }) }));

const mockUseA2aMetrics = vi.mocked(useA2aMetrics);

function state(overrides: Partial<UseA2aMetricsResult> = {}): UseA2aMetricsResult {
  return {
    status: "ready",
    metrics: {
      totalAgents: 23,
      activeAgents: 16,
      successRate: 94.231,
      avgResponseTime: 1.284,
    },
    fallbackCounts: undefined,
    lastUpdated: Date.now(),
    ...overrides,
  };
}

describe("A2aRuntimeCard", () => {
  beforeEach(() => {
    mockUseA2aMetrics.mockReset();
  });

  it("renders the title and the three stats", () => {
    mockUseA2aMetrics.mockReturnValue(state());
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.getByText("Runtime")).toBeInTheDocument();
    expect(screen.getByText("16 of 23 active")).toBeInTheDocument();
    expect(screen.getByText("94.2%")).toBeInTheDocument();
  });

  it("renders the response time as a duration, converted from seconds", () => {
    mockUseA2aMetrics.mockReturnValue(state());
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.getByText("1284ms")).toBeInTheDocument();
  });

  it("shows a permission gate when the caller lacks a2a.read", () => {
    mockUseA2aMetrics.mockReturnValue(
      state({ status: "forbidden", metrics: undefined, lastUpdated: null }),
    );
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.queryByText("Runtime")).not.toBeInTheDocument();
    expect(screen.getByText(/permission/i)).toBeInTheDocument();
  });

  it("shows a not-configured state when A2A is switched off", () => {
    mockUseA2aMetrics.mockReturnValue(
      state({ status: "disabled", metrics: undefined, lastUpdated: null }),
    );
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.getByText("A2A is turned off on this server.")).toBeInTheDocument();
  });

  it("keeps the agent count and dashes the rates when metrics are switched off", () => {
    mockUseA2aMetrics.mockReturnValue(
      state({ metrics: undefined, fallbackCounts: { active: 2, total: 3 } }),
    );
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.getByText("2 of 3 active")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows the empty state when no agents are registered", () => {
    mockUseA2aMetrics.mockReturnValue(
      state({ metrics: { totalAgents: 0, activeAgents: 0, successRate: 0, avgResponseTime: 0 } }),
    );
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.getByText("No agents have been added yet.")).toBeInTheDocument();
  });

  it("surfaces a load failure", () => {
    mockUseA2aMetrics.mockReturnValue(
      state({ status: "error", metrics: undefined, lastUpdated: null }),
    );
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load agent metrics.");
  });

  it("dashes every stat rather than crashing on a partial aggregate", () => {
    mockUseA2aMetrics.mockReturnValue(
      state({ metrics: {} as unknown as UseA2aMetricsResult["metrics"] }),
    );
    renderWithProviders(<A2aRuntimeCard />);

    expect(screen.getByText("Runtime")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
