/**
 * Bare trend line: no axes, grid, legend or dots, plus a hover readout.
 *
 * The y-domain is anchored at 0 rather than fitted; a fitted domain rescales on
 * every poll, making a flat metric appear to jump when only the scale moved.
 * `tickCount={2}` is load-bearing: without it recharts rounds the domain up to
 * nice tick values and the peak stops short of the top of the band.
 *
 * The row's value is text beside the chart, so the line itself carries no
 * information a screen reader needs. The tooltip is a pointer-only
 * enhancement on top of that, not the only route to the data.
 */

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

import type { SparklinePoint } from "./sparklineSeries";
import { SparklineTooltip } from "./SparklineTooltip";

/** Row height from the design frame. */
export const SPARKLINE_HEIGHT = 37;

interface SparklineProps {
  points: SparklinePoint[];
  formatValue: (value: number) => string;
  showCount: boolean;
}

export function Sparkline({ points, formatValue, showCount }: SparklineProps) {
  return (
    <div className="min-w-0 flex-1">
      <ResponsiveContainer width="100%" height={SPARKLINE_HEIGHT}>
        <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={[0, "dataMax"]} tickCount={2} />
          <Tooltip
            content={<SparklineTooltip formatValue={formatValue} showCount={showCount} />}
            cursor={{ stroke: "var(--color-muted-foreground)", strokeWidth: 1 }}
            isAnimationActive={false}
            // Each row's chart wrapper is position:relative with z-index auto, so
            // rows paint in document order and an upper row's tooltip lands behind
            // the rows below it. Matches the z-50 used by the ui/ overlays.
            wrapperStyle={{ zIndex: 50 }}
          />
          <Line
            dataKey="line"
            type="linear"
            stroke="var(--color-status-icon)"
            strokeWidth={1}
            strokeOpacity={0.9}
            dot={false}
            activeDot={{ r: 2, strokeWidth: 0, fill: "var(--color-status-icon)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
