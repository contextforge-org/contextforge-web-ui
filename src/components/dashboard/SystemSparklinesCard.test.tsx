import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test/test-utils";

import { SystemSparklinesCard } from "./SystemSparklinesCard";

const mockNavigate = vi.fn();
vi.mock("@/router", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/app/", params: {} }),
}));

const HOUR_MS = 3_600_000;

/** ISO time for a bucket `hoursAgo` before the current interval boundary. */
function bucket(hoursAgo: number): string {
  const current = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  return new Date(current - hoursAgo * HOUR_MS).toISOString();
}

describe("SystemSparklinesCard", () => {
  it("renders a row per metric under the window title", () => {
    renderWithProviders(<SystemSparklinesCard timeseries={null} percentiles={null} />);

    expect(screen.getByText("Executions")).toBeInTheDocument();
    expect(screen.getByText("p50 latency")).toBeInTheDocument();
    expect(screen.getByText("p95 latency")).toBeInTheDocument();
    expect(screen.getByText("p99 latency")).toBeInTheDocument();
    expect(screen.getByText("Traffic, last 24 hours")).toBeInTheDocument();
  });

  it("totals executions across the window and takes the latest latency bucket", () => {
    renderWithProviders(
      <SystemSparklinesCard
        timeseries={{ buckets: [bucket(3), bucket(1)], values: [2, 5] }}
        percentiles={{
          buckets: [bucket(3), bucket(1)],
          p50: [0.9, 0.317],
          p95: [1.2, 0.472],
          p99: [1.4, 0.523],
        }}
      />,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("0.317ms")).toBeInTheDocument();
    expect(screen.getByText("0.472ms")).toBeInTheDocument();
    expect(screen.getByText("0.523ms")).toBeInTheDocument();
  });

  it("explains an empty window rather than showing it as a failure", () => {
    renderWithProviders(
      <SystemSparklinesCard
        timeseries={{ buckets: [], values: [] }}
        percentiles={{ buckets: [], p50: [], p95: [], p99: [] }}
      />,
    );

    expect(screen.getByText(/No traced requests/)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load metrics.")).not.toBeInTheDocument();
  });

  it("surfaces a load failure", () => {
    renderWithProviders(
      <SystemSparklinesCard timeseries={null} percentiles={null} error={new Error("boom")} />,
    );

    expect(screen.getByText("Couldn't load metrics.")).toBeInTheDocument();
    expect(screen.queryByText(/No traced requests/)).not.toBeInTheDocument();
  });

  it("shows skeletons while the first load is in flight", () => {
    const { container } = renderWithProviders(
      <SystemSparklinesCard timeseries={null} percentiles={null} loading />,
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
  });

  it("routes the System status button to the system view", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SystemSparklinesCard timeseries={null} percentiles={null} />);

    await user.click(screen.getByRole("button", { name: /system status/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/app/?view=system");
  });
});
