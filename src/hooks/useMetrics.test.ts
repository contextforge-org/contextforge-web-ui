import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { metricsApi } from "@/api/metrics";

import { REFRESH_INTERVAL_MS, useMetrics, WINDOW_HOURS } from "./useMetrics";

vi.mock("@/api/metrics", () => ({
  metricsApi: { getTimeseries: vi.fn(), getPercentiles: vi.fn() },
}));

const mockTimeseries = vi.mocked(metricsApi.getTimeseries);
const mockPercentiles = vi.mocked(metricsApi.getPercentiles);

function resolveBoth() {
  mockTimeseries.mockResolvedValue({ buckets: [], values: [] });
  mockPercentiles.mockResolvedValue({ buckets: [], p50: [], p95: [], p99: [] });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisibility("visible");
    resolveBoth();
  });

  afterEach(() => vi.useRealTimers());

  it("requests both endpoints over the fixed window", async () => {
    const { result } = renderHook(() => useMetrics());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockTimeseries).toHaveBeenCalledWith(expect.objectContaining({ hours: WINDOW_HOURS }));
    expect(mockPercentiles).toHaveBeenCalledWith(expect.objectContaining({ hours: WINDOW_HOURS }));
  });

  it("reports a 403 as forbidden rather than an error", async () => {
    const denied = Object.assign(new Error("Forbidden"), { status: 403 });
    mockTimeseries.mockRejectedValue(denied);

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => expect(result.current.forbidden).toBe(true));
    expect(result.current.error).toBeNull();
  });

  it("reports other failures as errors", async () => {
    mockTimeseries.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.forbidden).toBe(false);
  });

  it("keeps polling after a failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockTimeseries.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useMetrics());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    resolveBoth();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    });

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(mockTimeseries.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useMetrics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsAfterMount = mockTimeseries.mock.calls.length;
    setVisibility("hidden");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2);
    });

    expect(mockTimeseries.mock.calls.length).toBe(callsAfterMount);
  });

  it("aborts the in-flight request on unmount", async () => {
    const { result, unmount } = renderHook(() => useMetrics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const { signal } = mockTimeseries.mock.calls[0][0] as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);

    unmount();

    expect(signal.aborted).toBe(true);
  });
});
