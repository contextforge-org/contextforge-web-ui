import { describe, expect, it, vi } from "vitest";
import { cloneElement, type ReactElement } from "react";
import { renderWithProviders } from "@/test/test-utils";

import { Sparkline } from "./Sparkline";
import { formatCount } from "./systemMetrics";
import type { SparklinePoint } from "./sparklineSeries";

// ResponsiveContainer measures its parent, which is 0x0 under jsdom, so the
// chart would render nothing. Only the sizing wrapper is replaced.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
        width: 200,
        height: 37,
      }),
  };
});

function points(): SparklinePoint[] {
  return [0, 3, 1].map((v, i) => ({ t: 1000 + i * 1000, line: v, value: v, count: v }));
}

describe("Sparkline", () => {
  it("lifts the tooltip above the rows below it", () => {
    // Each row's chart wrapper is position:relative with z-index auto, so
    // without this the first row's tooltip paints behind later rows.
    const { container } = renderWithProviders(
      <Sparkline points={points()} formatValue={formatCount} showCount={false} />,
    );

    const tooltip = container.querySelector<HTMLElement>(".recharts-tooltip-wrapper");
    expect(tooltip).not.toBeNull();
    expect(tooltip!.style.zIndex).toBe("50");
  });

  it("draws one line across every slot it is given", () => {
    const { container } = renderWithProviders(
      <Sparkline points={points()} formatValue={formatCount} showCount={false} />,
    );

    const curves = container.querySelectorAll(".recharts-line-curve");
    expect(curves).toHaveLength(1);
    expect(curves[0].getAttribute("d")).toMatch(/^M0,/);
  });

  it("hides the chart from assistive tech, since the row value is already text", () => {
    // Regression guard: this was dropped when the tooltip landed, exposing four
    // unnamed SVGs per card. recharts gives the svg no accessible name.
    const { container } = renderWithProviders(
      <Sparkline points={points()} formatValue={formatCount} showCount={false} />,
    );

    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
    expect(container.querySelector("svg")!.closest("[aria-hidden]")).not.toBeNull();
  });
});
