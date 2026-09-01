/**
 * The 24 hour trend card on the resting home state: executions, then p50/p95/p99.
 *
 * Alignment happens here rather than per row because the two endpoints return
 * sparse buckets independently and can disagree on which are populated. One
 * shared grid keeps all four rows on the same x-scale.
 */

import { useMemo } from "react";
import { useIntl } from "react-intl";

import type { PercentilesResponse, TimeseriesResponse } from "@/types/metrics";
import { WINDOW_HOURS, WINDOW_INTERVAL_MINUTES } from "@/hooks/useMetrics";

import { SparklineRow } from "./SparklineRow";
import {
  alignToGrid,
  buildGrid,
  headlineScalar,
  isEmptySeries,
  toSparklinePoints,
} from "./sparklineSeries";
import { formatCount, formatResponseTime } from "./systemMetrics";

interface SystemSparklinesCardProps {
  timeseries: TimeseriesResponse | null;
  percentiles: PercentilesResponse | null;
  loading?: boolean;
  error?: Error | null;
}

export function SystemSparklinesCard({
  timeseries,
  percentiles,
  loading,
  error,
}: SystemSparklinesCardProps) {
  const intl = useIntl();

  const rows = useMemo(() => {
    const grid = buildGrid(Date.now(), WINDOW_HOURS, WINDOW_INTERVAL_MINUTES);

    const executions = alignToGrid(
      timeseries?.buckets ?? [],
      timeseries?.values ?? [],
      grid,
      "zero",
    );
    const latency = (key: "p50" | "p95" | "p99") =>
      alignToGrid(percentiles?.buckets ?? [], percentiles?.[key] ?? [], grid, "gap");

    // Executions doubles as the per-slot sample count, which is what lets the
    // latency tooltips say how many requests a percentile was taken over.
    const counts = executions.map((v) => v ?? 0);

    return [
      {
        key: "executions",
        label: intl.formatMessage({ id: "dashboard.home.sparklines.executions" }),
        points: executions,
        chart: toSparklinePoints(grid, executions, counts),
        value: formatCount(headlineScalar(executions, "sum")),
        // The executions tooltip names its own unit, so it needs no count line.
        formatValue: (count: number) =>
          intl.formatMessage({ id: "dashboard.home.sparklines.tooltip.executions" }, { count }),
        showCount: false,
      },
      ...(["p50", "p95", "p99"] as const).map((key) => {
        const points = latency(key);
        return {
          key,
          label: intl.formatMessage({ id: `dashboard.home.sparklines.${key}` }),
          points,
          chart: toSparklinePoints(grid, points, counts),
          value: formatResponseTime(headlineScalar(points, "latest")),
          formatValue: formatResponseTime,
          showCount: true,
        };
      }),
    ];
  }, [intl, timeseries, percentiles]);

  const isEmpty = !loading && !error && rows.every((row) => isEmptySeries(row.points));

  return (
    <div className="rounded-lg bg-card px-5 pt-4 pb-6 shadow-xs ring-1 ring-foreground/10">
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-xs leading-4 font-medium text-muted-foreground">
          {error
            ? intl.formatMessage({ id: "dashboard.home.sparklines.error" })
            : isEmpty
              ? intl.formatMessage({ id: "dashboard.home.sparklines.empty" })
              : null}
        </p>
        <span className="shrink-0 text-xs leading-4 font-medium text-muted-foreground">
          {intl.formatMessage({ id: "dashboard.home.sparklines.window" })}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <SparklineRow
            key={row.key}
            label={row.label}
            value={row.value}
            points={row.chart}
            formatValue={row.formatValue}
            showCount={row.showCount}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}
