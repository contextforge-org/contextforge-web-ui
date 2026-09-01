/**
 * One metric row: a fixed-width label column, so all four lines share a left
 * edge, beside the trend line.
 */

import type { ReactNode } from "react";

import { Sparkline, SPARKLINE_HEIGHT } from "./Sparkline";
import { StatBlock } from "./SystemStat";

interface SparklineRowProps {
  label: ReactNode;
  /** Pre-formatted value string (see `systemMetrics.ts` formatters). */
  value: ReactNode;
  points: (number | null)[];
  loading?: boolean;
}

export function SparklineRow({ label, value, points, loading }: SparklineRowProps) {
  return (
    <div className="flex items-end gap-4">
      <div className="w-[102px] shrink-0">
        <StatBlock label={label} value={value} loading={loading} />
      </div>
      {loading ? (
        <div className="flex-1" style={{ height: SPARKLINE_HEIGHT }} />
      ) : (
        <Sparkline points={points} />
      )}
    </div>
  );
}
