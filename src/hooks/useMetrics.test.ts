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

  it("wraps a non-Error rejection so the card always has a message", async () => {
    mockTimeseries.mockRejectedValue("boom");

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe("Failed to load metrics");
  });

  it("discards a response that resolves after the request was aborted", async () => {
    let release: (() => void) | undefined;
    mockTimeseries.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ buckets: ["2026-09-01T12:00:00Z"], values: [9] });
        }),
    );

    const { result } = renderHook(() => useMetrics());
    await waitFor(() => expect(release).toBeDefined());

    // A second fetch aborts the first; the first must not publish its result.
    act(() => result.current.refetch());
    await act(async () => {
      release?.();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.timeseries).toEqual({ buckets: [], values: [] });
  });

  it("refetches on becoming visible when nothing has loaded yet", async () => {
    setVisibility("hidden");
    mockTimeseries.mockImplementationOnce(() => new Promise(() => {}));

    renderHook(() => useMetrics());
    await waitFor(() => expect(mockTimeseries).toHaveBeenCalled());

    await act(async () => {
      setVisibility("visible");
    });

    await waitFor(() => expect(mockTimeseries.mock.calls.length).toBeGreaterThan(1));
  });

  it("refetches on becoming visible when the last success is older than the interval", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setVisibility("hidden");
    const { result } = renderHook(() => useMetrics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsAfterMount = mockTimeseries.mock.calls.length;
    vi.setSystemTime(Date.now() + REFRESH_INTERVAL_MS);
    await act(async () => {
      setVisibility("visible");
    });

    await waitFor(() => expect(mockTimeseries.mock.calls.length).toBeGreaterThan(callsAfterMount));
  });

  it("does not refetch on becoming visible while the data is still fresh", async () => {
    setVisibility("hidden");
    const { result } = renderHook(() => useMetrics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsAfterMount = mockTimeseries.mock.calls.length;
    await act(async () => {
      setVisibility("visible");
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
