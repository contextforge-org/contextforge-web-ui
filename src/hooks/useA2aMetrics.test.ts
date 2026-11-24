import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useQuery } from "@/hooks/useQuery";

import { useA2aMetrics } from "./useA2aMetrics";

vi.mock("@/hooks/useQuery", () => ({ useQuery: vi.fn() }));

const mockUseQuery = vi.mocked(useQuery);

type QueryError = { message: string; status?: number; body?: unknown };

function result(data: unknown, error: QueryError | null = null, isLoading = false) {
  return {
    data,
    error,
    isLoading,
    execute: vi.fn(),
    refetch: vi.fn().mockResolvedValue(undefined),
    setData: vi.fn(),
  } as unknown as ReturnType<typeof useQuery>;
}

/** Answers the metrics path, then the conditional agents path. */
function mockPaths(metrics: ReturnType<typeof result>, agents = result(undefined)) {
  mockUseQuery.mockImplementation((path: string | null) =>
    path === "/v1/a2a/metrics" ? metrics : agents,
  );
}

const AGGREGATE = {
  totalAgents: 23,
  activeAgents: 16,
  successRate: 94.2,
  avgResponseTime: 1.28,
};

const notFound = (body: unknown): QueryError => ({ message: "HTTP 404", status: 404, body });

describe("useA2aMetrics", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it("reports the aggregate once it loads", () => {
    mockPaths(result(AGGREGATE));
    const { result: hook } = renderHook(() => useA2aMetrics(0));

    expect(hook.current.status).toBe("ready");
    expect(hook.current.metrics).toEqual(AGGREGATE);
    expect(hook.current.lastUpdated).not.toBeNull();
  });

  it("reports forbidden on a 403", () => {
    mockPaths(result(undefined, { message: "HTTP 403", status: 403 }));
    const { result: hook } = renderHook(() => useA2aMetrics(0));

    expect(hook.current.status).toBe("forbidden");
  });

  it("reports disabled for the typed a2a_disabled 404", () => {
    mockPaths(result(undefined, notFound({ detail: { error: "a2a_disabled" } })));
    const { result: hook } = renderHook(() => useA2aMetrics(0));

    expect(hook.current.status).toBe("disabled");
    expect(hook.current.fallbackCounts).toBeUndefined();
  });

  it("falls back to the agent list when only metrics are disabled", () => {
    mockPaths(
      result(undefined, notFound({ detail: "A2A metrics are disabled" })),
      result([{ enabled: true }, { enabled: true }, { enabled: false }]),
    );
    const { result: hook } = renderHook(() => useA2aMetrics(0));

    expect(hook.current.status).toBe("ready");
    expect(hook.current.metrics).toBeUndefined();
    expect(hook.current.fallbackCounts).toEqual({ active: 2, total: 3 });
  });

  it("falls back for an untyped 404, as a backend without the route returns", () => {
    mockPaths(result(undefined, notFound({ detail: "Not Found" })), result([{ enabled: true }]));
    const { result: hook } = renderHook(() => useA2aMetrics(0));

    expect(hook.current.status).toBe("ready");
    expect(hook.current.fallbackCounts).toEqual({ active: 1, total: 1 });
  });

  it("reports an error when the fallback list also fails", () => {
    mockPaths(
      result(undefined, notFound({ detail: "A2A metrics are disabled" })),
      result(undefined, { message: "HTTP 500", status: 500 }),
    );
    const { result: hook } = renderHook(() => useA2aMetrics(0));

    expect(hook.current.status).toBe("error");
  });

  it("stays loading before the first response", () => {
    mockPaths(result(undefined, null, true));
    const { result: hook } = renderHook(() => useA2aMetrics(0));

    expect(hook.current.status).toBe("loading");
    expect(hook.current.lastUpdated).toBeNull();
  });
});
