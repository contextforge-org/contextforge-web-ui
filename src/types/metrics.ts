/**
 * Observability metrics types. `mcpgateway/routers/observability.py` is the
 * source of truth.
 *
 * `buckets` is sparse — only intervals containing traces are returned, so a 24h
 * window with three busy hours yields three entries. Align onto a full grid
 * before plotting; see `components/dashboard/sparklineSeries.ts`.
 *
 * Both endpoints return empty arrays, not an error, when observability is off.
 */

/** Execution counts bucketed over time. */
export interface TimeseriesResponse {
  /** ISO 8601 bucket start times, ascending. Sparse. */
  buckets: string[];
  /** Execution count per bucket, index-aligned with `buckets`. */
  values: number[];
}

/** Latency percentiles (milliseconds) bucketed over time. */
export interface PercentilesResponse {
  /** ISO 8601 bucket start times, ascending. Sparse. */
  buckets: string[];
  p50: number[];
  p95: number[];
  p99: number[];
}
