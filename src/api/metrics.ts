/**
 * Observability metrics endpoints.
 *
 * Both require `metrics:read`, enforced with `allow_admin_bypass=False` and
 * `global_only=True`. Platform admins do not bypass it; only `platform_admin`
 * and `platform_viewer` hold it by default, so a 403 is a routine outcome.
 */

import type { PercentilesResponse, TimeseriesResponse } from "@/types/metrics";

import { api } from "./client";

// Mirrors the Query() bounds in mcpgateway/routers/observability.py.
const HOURS_MIN = 1;
const HOURS_MAX = 168;
const INTERVAL_MIN = 5;
const INTERVAL_MAX = 1440;

export interface MetricsParams {
  /** Time range in hours (1-168). Server defaults to 24. */
  hours?: number;
  /** Aggregation bucket size in minutes (5-1440). Server defaults to 60. */
  intervalMinutes?: number;
  signal?: AbortSignal;
}

function clampInt(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildQuery(params: MetricsParams): string {
  const search = new URLSearchParams();

  const hours = clampInt(params.hours, HOURS_MIN, HOURS_MAX);
  if (hours !== undefined) search.set("hours", hours.toString());

  const interval = clampInt(params.intervalMinutes, INTERVAL_MIN, INTERVAL_MAX);
  if (interval !== undefined) search.set("interval_minutes", interval.toString());

  const query = search.toString();
  return query ? `?${query}` : "";
}

export const metricsApi = {
  /** Execution counts bucketed over time. Buckets are sparse. */
  getTimeseries: (params: MetricsParams = {}): Promise<TimeseriesResponse> =>
    api.get<TimeseriesResponse>(
      `/observability/metrics/timeseries${buildQuery(params)}`,
      undefined,
      params.signal,
    ),

  /** Latency percentiles (p50/p95/p99, ms) bucketed over time. Buckets are sparse. */
  getPercentiles: (params: MetricsParams = {}): Promise<PercentilesResponse> =>
    api.get<PercentilesResponse>(
      `/observability/metrics/percentiles${buildQuery(params)}`,
      undefined,
      params.signal,
    ),
};

export const __test__ = { buildQuery, clampInt };
