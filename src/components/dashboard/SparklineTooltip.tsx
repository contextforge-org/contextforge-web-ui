/**
 * Hover readout for one sparkline slot: the hour, the value, and how many
 * requests produced it.
 *
 * The request count is the point of this: a p95 over three samples is not a
 * meaningful percentile, and nothing else on the card lets a reader tell that.
 */

import { useIntl } from "react-intl";

import type { SparklinePoint } from "./sparklineSeries";

interface SparklineTooltipProps {
  /** Injected by recharts. */
  active?: boolean;
  payload?: { payload: SparklinePoint }[];
  formatValue: (value: number) => string;
  /** Counts are redundant on the executions row, where the value is the count. */
  showCount: boolean;
}

export function SparklineTooltip({
  active,
  payload,
  formatValue,
  showCount,
}: SparklineTooltipProps) {
  const intl = useIntl();
  const point = payload?.[0]?.payload;

  if (!active || !point) return null;

  return (
    <div className="rounded-md bg-popover px-2 py-1 text-xs leading-4 shadow-md ring-1 ring-foreground/10">
      <span className="text-muted-foreground">
        {intl.formatTime(point.t, { hour: "2-digit", minute: "2-digit" })}
      </span>{" "}
      <span className="tabular-nums text-popover-foreground">
        {point.value === null
          ? intl.formatMessage({ id: "dashboard.home.sparklines.tooltip.noRequests" })
          : formatValue(point.value)}
      </span>
      {showCount && point.value !== null && (
        <span className="text-muted-foreground">
          {" · "}
          {intl.formatMessage(
            { id: "dashboard.home.sparklines.tooltip.requests" },
            { count: point.count },
          )}
        </span>
      )}
    </div>
  );
}
