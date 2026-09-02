import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { useMetrics } from "@/hooks/useMetrics";
import { renderWithProviders } from "@/test/test-utils";

import { SystemSparklinesCardConnected } from "./SystemSparklinesCardConnected";

vi.mock("@/router", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/", params: {} }),
}));

vi.mock("@/hooks/useMetrics", () => ({
  useMetrics: vi.fn(),
  WINDOW_HOURS: 24,
  WINDOW_INTERVAL_MINUTES: 60,
}));

const mockUseMetrics = vi.mocked(useMetrics);

function metricsState(overrides: Partial<ReturnType<typeof useMetrics>> = {}) {
  return {
    timeseries: null,
    percentiles: null,
    isLoading: false,
    error: null,
    forbidden: false,
    lastUpdated: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("SystemSparklinesCardConnected", () => {
  beforeEach(() => mockUseMetrics.mockReset());

  it("renders nothing when the caller lacks metrics:read", () => {
    mockUseMetrics.mockReturnValue(metricsState({ forbidden: true }));

    const { container } = renderWithProviders(<SystemSparklinesCardConnected />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the card otherwise", () => {
    mockUseMetrics.mockReturnValue(
      metricsState({
        timeseries: { buckets: [], values: [] },
        percentiles: { buckets: [], p50: [], p95: [], p99: [] },
      }),
    );

    renderWithProviders(<SystemSparklinesCardConnected />);

    expect(screen.getByText("Traffic, last 24 hours")).toBeInTheDocument();
  });

  it("only shows the loading state on the first load, not on a refresh", () => {
    mockUseMetrics.mockReturnValue(
      metricsState({ isLoading: true, timeseries: { buckets: [], values: [] } }),
    );

    const { container } = renderWithProviders(<SystemSparklinesCardConnected />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });
});
