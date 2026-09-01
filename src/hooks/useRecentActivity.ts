/**
 * useRecentActivity
 *
 * Polls GET /api/logs/activity every POLL_INTERVAL_MS. When
 * VITE_USE_MOCK_ACTIVITY=true (dev convenience while the backend endpoint is
 * unimplemented), returns a lazily-imported fixture without a network call.
 * The dynamic import keeps the fixture out of the default production bundle.
 *
 * Responses are applied only if they belong to the most recent request, so a
 * slow poll that resolves after a newer one cannot revert the feed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { activityApi } from "@/api/activity";
import type { ActivityItem } from "@/types/activity";

export const RECENT_ACTIVITY_POLL_INTERVAL_MS = 30_000;

interface UseRecentActivityResult {
  items: ActivityItem[];
  isLoading: boolean;
  /** The original error, so callers can inspect `ApiError.status` (e.g. 403). */
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseRecentActivityOptions {
  /** Defaults to 10. Server clamps to [1, 100]. */
  limit?: number;
  /** Polling cadence override. Pass 0 to disable. */
  pollIntervalMs?: number;
  /** When false, no request is made and the feed stays empty. */
  enabled?: boolean;
}

function isMockEnabled(): boolean {
  return import.meta.env.VITE_USE_MOCK_ACTIVITY === "true";
}

export function useRecentActivity(options: UseRecentActivityOptions = {}): UseRecentActivityResult {
  const { limit = 10, pollIntervalMs = RECENT_ACTIVITY_POLL_INTERVAL_MS, enabled = true } = options;
  const mock = isMockEnabled();

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Poll ticks share one AbortController, so a tick never cancels its
  // predecessor; `refetch` carries no signal at all. The counter is what makes
  // the newest request the only one allowed to write state.
  const requestSeq = useRef(0);

  const fetchOnce = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const seq = ++requestSeq.current;
      const isStale = (): boolean => seq !== requestSeq.current;

      if (mock) {
        // Loaded lazily so the fixture is tree-shaken out of the production
        // bundle when VITE_USE_MOCK_ACTIVITY is unset (the default).
        const { RECENT_ACTIVITY_FIXTURE } = await import("@/mocks/recentActivity");
        if (isStale()) return;
        setItems(RECENT_ACTIVITY_FIXTURE.slice(0, limit));
        setIsLoading(false);
        setError(null);
        return;
      }

      try {
        const response = await activityApi.list({ limit, signal });
        if (isStale()) return;
        setItems(response.items);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (isStale()) return;
        // Keep the original error rather than flattening it to { message }:
        // ApiError carries the status, and `isPermissionDenied` needs the
        // instance to tell a 403 from any other failure.
        setError(err instanceof Error ? err : new Error("Failed to load recent activity"));
      } finally {
        if (!signal?.aborted && !isStale()) setIsLoading(false);
      }
    },
    [limit, mock],
  );

  useEffect(() => {
    if (!enabled) {
      // Invalidate anything in flight: an unsignaled `refetch` would otherwise
      // repopulate the feed after this cleared it.
      requestSeq.current += 1;
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    void fetchOnce(controller.signal);

    if (mock || pollIntervalMs <= 0) {
      return () => controller.abort();
    }

    const intervalId = window.setInterval(() => {
      void fetchOnce(controller.signal);
    }, pollIntervalMs);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [fetchOnce, mock, pollIntervalMs, enabled]);

  const refetch = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setIsLoading(true);
    await fetchOnce();
  }, [fetchOnce, enabled]);

  return { items, isLoading, error, refetch };
}
