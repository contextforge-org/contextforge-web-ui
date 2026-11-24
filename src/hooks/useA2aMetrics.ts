/**
 * useA2aMetrics (#7324) — polls `GET /v1/a2a/metrics` for the home A2A card.
 *
 * The route 404s both when A2A is off and when only its metrics are off, so the
 * error is classified here. Only the first is typed (`detail.error`), so any
 * other 404 falls back to counting agents from the list.
 */

import { useEffect, useState } from "react";

import { useQuery } from "@/hooks/useQuery";
import { countActiveTotal, type Activatable } from "@/components/dashboard/systemMetrics";

const METRICS_PATH = "/v1/a2a/metrics";
const AGENTS_PATH = "/v1/a2a?limit=0&include_inactive=true";

export const A2A_METRICS_POLL_INTERVAL_MS = 60_000;

/** `A2AAgentAggregateMetrics`, trimmed to what the card renders. */
export interface A2aMetrics {
  totalAgents: number;
  activeAgents: number;
  successRate: number;
  /** Seconds. */
  avgResponseTime: number;
}

export type A2aStatus =
  | "loading"
  | "ready"
  /** No `a2a.read`. */
  | "forbidden"
  /** `MCPGATEWAY_A2A_ENABLED=false`. */
  | "disabled"
  | "error";

export interface UseA2aMetricsResult {
  status: A2aStatus;
  metrics: A2aMetrics | undefined;
  /** Set when metrics are off and the count came from the list instead. */
  fallbackCounts: { active: number; total: number } | undefined;
  lastUpdated: number | null;
}

function isA2aDisabled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null) return false;
  return (detail as { error?: unknown }).error === "a2a_disabled";
}

export function useA2aMetrics(
  pollIntervalMs: number = A2A_METRICS_POLL_INTERVAL_MS,
): UseA2aMetricsResult {
  const query = useQuery<A2aMetrics>(METRICS_PATH);
  const { data, error, isLoading, refetch } = query;

  const metricsOff = error?.status === 404 && !isA2aDisabled(error.body);
  const agents = useQuery<Activatable[]>(metricsOff ? AGENTS_PATH : null);

  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  useEffect(() => {
    if (data || agents.data) setLastUpdated(Date.now());
  }, [data, agents.data]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refetch().catch(() => {
        /* surfaced via query.error */
      });
    };
    const id = setInterval(tick, pollIntervalMs);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollIntervalMs, refetch]);

  const status: A2aStatus = (() => {
    if (data) return "ready";
    if (error?.status === 403) return "forbidden";
    if (error?.status === 404 && isA2aDisabled(error.body)) return "disabled";
    if (metricsOff) return agents.data ? "ready" : agents.error ? "error" : "loading";
    if (isLoading) return "loading";
    return error ? "error" : "loading";
  })();

  return {
    status,
    metrics: data,
    fallbackCounts: metricsOff && agents.data ? countActiveTotal(agents.data) : undefined,
    lastUpdated,
  };
}
