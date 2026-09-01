import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/test-utils";

import { SparklineTooltip } from "./SparklineTooltip";
import { formatCount, formatResponseTime } from "./systemMetrics";
import type { SparklinePoint } from "./sparklineSeries";

function point(overrides: Partial<SparklinePoint> = {}): SparklinePoint {
  return {
    t: Date.parse("2026-09-01T14:00:00Z"),
    line: 0.472,
    value: 0.472,
    count: 3,
    ...overrides,
  };
}

function render(p: SparklinePoint, formatValue = formatResponseTime, showCount = true) {
  return renderWithProviders(
    <SparklineTooltip
      active
      payload={[{ payload: p }]}
      formatValue={formatValue}
      showCount={showCount}
    />,
  );
}

describe("SparklineTooltip", () => {
  it("renders nothing unless recharts marks it active", () => {
    const { container } = renderWithProviders(
      <SparklineTooltip payload={[{ payload: point() }]} formatValue={formatCount} showCount />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing without a payload", () => {
    const { container } = renderWithProviders(
      <SparklineTooltip active formatValue={formatCount} showCount />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("qualifies a latency reading with the sample it came from", () => {
    render(point());
    expect(screen.getByText("0.472ms")).toBeInTheDocument();
    expect(screen.getByText(/3 requests/)).toBeInTheDocument();
  });

  it("says no requests for an idle slot instead of reporting the drawn zero", () => {
    render(point({ value: null, line: 0, count: 0 }));
    expect(screen.getByText("No requests")).toBeInTheDocument();
    expect(screen.queryByText("0.000ms")).not.toBeInTheDocument();
  });

  it("singularizes a lone request", () => {
    render(point({ count: 1 }));
    expect(screen.getByText(/1 request(?!s)/)).toBeInTheDocument();
  });

  it("omits the count on the executions row, where it duplicates the value", () => {
    render(point({ value: 22, line: 22, count: 22 }), formatCount, false);
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.queryByText(/requests/)).not.toBeInTheDocument();
  });
});
