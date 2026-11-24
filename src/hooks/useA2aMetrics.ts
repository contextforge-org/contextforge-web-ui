/**
 * useA2aMetrics (#7324) — polls `GET /v1/a2a/metrics` for the home A2A card.
 *
 * The route 404s both when A2A is off and when only its metrics are off, so the
 * error is classified here. Only the first is typed (`detail.error`), so any
 * other 404 falls back to counting agents from the list.
 */

import { useEffect, useState } from "react";

import { useQuery } from "@/hooks/useQuery";
import type { Activatable } from "@/components/dashboard/systemMetrics";

const METRICS_PATH = "/v1/a2a/metrics";
const AGENTS_PATH = "/v1/a2a?limit=0&include_inactive=true";

export const A2A_METRICS_POLL_INTERVAL_MS = 60_000;

/** `A2AAgentAggregateMetrics`, trimmed to what the card renders. */
export interface A2aMetrics {
  totalAgents: number;
  activeAgents: number;
  /** Zero means no traffic; the rates are then 0, not null. */
  totalInteractions: number;
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

type QueryError = { status?: number; body?: unknown } | null;

function isA2aDisabled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null) return false;
  return (detail as { error?: unknown }).error === "a2a_disabled";
}

/** Mirrors the aggregate, which counts `enabled IS TRUE` and ignores reachability. */
function countEnabled(agents: Activatable[] | undefined) {
  if (!Array.isArray(agents)) return undefined;
  return { active: agents.filter((agent) => agent.enabled !== false).length, total: agents.length };
}

/** `useQuery` clears its error while refetching, so hold the last settled one. */
function useSettledError(error: QueryError, isLoading: boolean): QueryError {
  const [settled, setSettled] = useState<QueryError>(null);
  useEffect(() => {
    if (!isLoading) setSettled(error ?? null);
  }, [isLoading, error]);
  return isLoading ? settled : (error ?? null);
}

export function useA2aMetrics(
  pollIntervalMs: number = A2A_METRICS_POLL_INTERVAL_MS,
): UseA2aMetricsResult {
  const query = useQuery<A2aMetrics>(METRICS_PATH);
  const { data, refetch } = query;
  const error = useSettledError(query.error, query.isLoading);

  const forbidden = error?.status === 403;
  const disabled = error?.status === 404 && isA2aDisabled(error.body);
  const metricsOff = error?.status === 404 && !isA2aDisabled(error.body);

  const agents = useQuery<Activatable[]>(metricsOff ? AGENTS_PATH : null);
  const agentsError = useSettledError(agents.error, agents.isLoading);
  const agentsRefetch = agents.refetch;
  const fallbackCounts = metricsOff ? countEnabled(agents.data) : undefined;

  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  useEffect(() => {
    if (data || agents.data) setLastUpdated(Date.now());
  }, [data, agents.data]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const swallow = () => {
        /* surfaced via the query's error */
      };
      void refetch().catch(swallow);
      if (metricsOff) void agentsRefetch().catch(swallow);
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
  }, [pollIntervalMs, refetch, agentsRefetch, metricsOff]);

  // Forbidden and disabled outrank a cached aggregate; a generic error does
  // not, and keeps the last-known values until the next poll.
  const status: A2aStatus = (() => {
    if (forbidden) return "forbidden";
    if (disabled) return "disabled";
    if (metricsOff) return fallbackCounts ? "ready" : agentsError ? "error" : "loading";
    if (data) return "ready";
    if (error) return "error";
    return "loading";
  })();

  return {
    status,
    metrics: forbidden || disabled || metricsOff ? undefined : data,
    fallbackCounts,
    lastUpdated,
  };
}
