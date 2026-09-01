import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { server } from "@/test/mocks/server";
import { RECENT_ACTIVITY_FIXTURE } from "@/mocks/recentActivity";

import { useRecentActivity } from "./useRecentActivity";

/**
 * Give a released-but-superseded response time to travel back through msw,
 * fetch and the hook. Without the guard under test it would land inside this
 * window and overwrite state, which is exactly what the assertions catch.
 */
async function flushStaleResponse(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("useRecentActivity", () => {
  it("fetches and returns the typed payload", async () => {
    const { result } = renderHook(() => useRecentActivity({ pollIntervalMs: 0 }));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.items).toHaveLength(RECENT_ACTIVITY_FIXTURE.length);
    expect(result.current.items[0].id).toBe(RECENT_ACTIVITY_FIXTURE[0].id);
  });

  it("respects the limit parameter", async () => {
    const { result } = renderHook(() => useRecentActivity({ limit: 3, pollIntervalMs: 0 }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toHaveLength(3);
  });

  it("sets error state when the server fails", async () => {
    server.use(
      http.get("*/api/logs/activity", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    );

    const { result } = renderHook(() => useRecentActivity({ pollIntervalMs: 0 }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it("makes no request while disabled and fetches once enabled", async () => {
    let callCount = 0;
    server.use(
      http.get("*/api/logs/activity", () => {
        callCount += 1;
        return HttpResponse.json({ items: RECENT_ACTIVITY_FIXTURE.slice(0, 2) });
      }),
    );

    const { result, rerender } = renderHook(
      ({ enabled }) => useRecentActivity({ pollIntervalMs: 0, enabled }),
      { initialProps: { enabled: false } },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(callCount).toBe(0);
    expect(result.current.items).toEqual([]);

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(callCount).toBe(1);
  });

  it("stays loading when a limit change aborts the first request", async () => {
    let callCount = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/api/logs/activity", async () => {
        callCount += 1;
        await gate;
        return HttpResponse.json({ items: RECENT_ACTIVITY_FIXTURE.slice(0, 2) });
      }),
    );

    const { result, rerender } = renderHook(
      ({ limit }) => useRecentActivity({ limit, pollIntervalMs: 0 }),
      { initialProps: { limit: 10 } },
    );

    await waitFor(() => expect(callCount).toBe(1));
    rerender({ limit: 20 });
    await waitFor(() => expect(callCount).toBe(2));

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      release?.();
      await gate;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(2);
  });

  it("ignores a slow poll that resolves after a newer request", async () => {
    let callCount = 0;
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    server.use(
      http.get("*/api/logs/activity", async () => {
        callCount += 1;
        if (callCount === 1) {
          await firstGate;
          // The stale snapshot: older, and one item shorter than what the
          // newer request already returned.
          return HttpResponse.json({ items: RECENT_ACTIVITY_FIXTURE.slice(0, 1) });
        }
        return HttpResponse.json({ items: RECENT_ACTIVITY_FIXTURE.slice(0, 3) });
      }),
    );

    const { result } = renderHook(() => useRecentActivity({ pollIntervalMs: 0 }));

    await waitFor(() => expect(callCount).toBe(1));

    // A refetch overtakes the still-pending initial request.
    await act(async () => {
      await result.current.refetch();
    });

    expect(callCount).toBe(2);
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    await act(async () => {
      releaseFirst?.();
      await flushStaleResponse();
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.items[0].id).toBe(RECENT_ACTIVITY_FIXTURE[0].id);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps the newer error when a stale request succeeds afterwards", async () => {
    let callCount = 0;
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    server.use(
      http.get("*/api/logs/activity", async () => {
        callCount += 1;
        if (callCount === 1) {
          await firstGate;
          return HttpResponse.json({ items: RECENT_ACTIVITY_FIXTURE.slice(0, 2) });
        }
        return HttpResponse.json({ detail: "boom" }, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useRecentActivity({ pollIntervalMs: 0 }));

    await waitFor(() => expect(callCount).toBe(1));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    await act(async () => {
      releaseFirst?.();
      await flushStaleResponse();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it("refetch re-hits the endpoint and clears the error", async () => {
    let callCount = 0;
    server.use(
      http.get("*/api/logs/activity", () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json({ detail: "boom" }, { status: 500 });
        }
        return HttpResponse.json({ items: RECENT_ACTIVITY_FIXTURE.slice(0, 2) });
      }),
    );

    const { result } = renderHook(() => useRecentActivity({ pollIntervalMs: 0 }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.refetch();
    });

    expect(callCount).toBe(2);
    expect(result.current.error).toBeNull();
    expect(result.current.items).toHaveLength(2);
  });
});
