/**
 * Bare trend line: no axes, grid, legend, tooltip or dots. `aria-hidden`,
 * because the row's value is already exposed as text beside it.
 *
 * The y-domain is anchored at 0 rather than fitted; a fitted domain rescales on
 * every poll, making a flat metric appear to jump when only the scale moved.
 * `tickCount={2}` is load-bearing: without it recharts rounds the domain up to
 * nice tick values and the peak stops short of the top of the band.
 *
 * `null` slots (hours with no data) are bridged rather than drawn at the floor.
 */

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

/** Row height from the design frame. */
export const SPARKLINE_HEIGHT = 37;

interface SparklineProps {
  /** One entry per grid slot, ascending. `null` means no data for that slot. */
  points: (number | null)[];
}

export function Sparkline({ points }: SparklineProps) {
  const data = points.map((v, i) => ({ i, v }));

  return (
    <div aria-hidden className="min-w-0 flex-1">
      <ResponsiveContainer width="100%" height={SPARKLINE_HEIGHT}>
        <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <YAxis hide domain={[0, "dataMax"]} tickCount={2} />
          <Line
            dataKey="v"
            type="linear"
            stroke="var(--color-status-icon)"
            strokeWidth={1}
            strokeOpacity={0.9}
            dot={false}
            activeDot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
