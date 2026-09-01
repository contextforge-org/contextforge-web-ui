/**
 * Polls both metrics endpoints over a fixed 24 hour window.
 *
 * Refreshes every 30s, pauses while the tab is hidden, and aborts in-flight
 * requests on unmount and on refetch. Errors surface without stopping the
 * interval — the next tick may succeed. A 403 is reported as `forbidden`
 * rather than `error`; see `api/metrics.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { metricsApi } from "@/api/metrics";
import type { PercentilesResponse, TimeseriesResponse } from "@/types/metrics";

/** 24h at 60m granularity = 24 buckets. Fixed: the card has no range control. */
export const WINDOW_HOURS = 24;
export const WINDOW_INTERVAL_MINUTES = 60;

export const REFRESH_INTERVAL_MS = 30_000;

export interface MetricsState {
  timeseries: TimeseriesResponse | null;
  percentiles: PercentilesResponse | null;
  isLoading: boolean;
  error: Error | null;
  /** True when the gateway rejected the read with 403 (no `metrics:read`). */
  forbidden: boolean;
  lastUpdated: Date | null;
  refetch: () => void;
}

function isForbidden(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 403;
}

export function useMetrics(): MetricsState {
  const [timeseries, setTimeseries] = useState<TimeseriesResponse | null>(null);
  const [percentiles, setPercentiles] = useState<PercentilesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read by the visibility handler without being a dependency of it, which
  // would re-register the listener on every fetch.
  const lastUpdatedRef = useRef<Date | null>(null);

  const fetchOnce = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    const params = {
      hours: WINDOW_HOURS,
      intervalMinutes: WINDOW_INTERVAL_MINUTES,
      signal: controller.signal,
    };

    try {
      const [ts, pct] = await Promise.all([
        metricsApi.getTimeseries(params),
        metricsApi.getPercentiles(params),
      ]);

      if (controller.signal.aborted) return;

      setTimeseries(ts);
      setPercentiles(pct);
      setForbidden(false);
      const now = new Date();
      lastUpdatedRef.current = now;
      setLastUpdated(now);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (isForbidden(err)) {
        setForbidden(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err : new Error("Failed to load metrics"));
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOnce();

    intervalRef.current = globalThis.setInterval(() => {
      if (document.visibilityState === "visible") void fetchOnce();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        globalThis.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [fetchOnce]);

  // On returning to a hidden tab, refetch straight away if the last success is
  // already older than the interval, rather than showing stale numbers.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      const last = lastUpdatedRef.current;
      const ageMs = last ? Date.now() - last.getTime() : Infinity;
      if (ageMs >= REFRESH_INTERVAL_MS) void fetchOnce();
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [fetchOnce]);

  return {
    timeseries,
    percentiles,
    isLoading,
    error,
    forbidden,
    lastUpdated,
    refetch: () => void fetchOnce(),
  };
}
