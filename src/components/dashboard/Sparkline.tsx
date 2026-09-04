/**
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
    <div aria-hidden className="min-w-0 flex-1">
      <ResponsiveContainer width="100%" height={SPARKLINE_HEIGHT}>
        <LineChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={[0, "dataMax"]} tickCount={2} />
          <Tooltip
            content={<SparklineTooltip formatValue={formatValue} showCount={showCount} />}
            cursor={{ stroke: "var(--color-muted-foreground)", strokeWidth: 1 }}
            isAnimationActive={false}
            // Keep tooltip above other elements
            wrapperStyle={{ zIndex: 50 }}
          />
          <Line
            dataKey="line"
            type="linear"
            stroke="var(--color-sparkline-stroke)"
            strokeWidth={1}
            strokeOpacity={0.9}
            dot={false}
            activeDot={{ r: 2, strokeWidth: 0, fill: "var(--color-sparkline-stroke)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
