import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCopyToClipboard } from "./useCopyToClipboard";

function setClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
}

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle", () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.status).toBe("idle");
  });

  it("sets status to copied on success and resets after the delay", async () => {
    setClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard(1500));

    await act(async () => {
      await result.current.copy("value");
    });
    expect(result.current.status).toBe("copied");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.status).toBe("idle");
  });

  it("sets status to error on rejection", async () => {
    setClipboard(() => Promise.reject(new Error("denied")));
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("value");
    });
    expect(result.current.status).toBe("error");
  });

  it("restarts the reset timer on a rapid second click", async () => {
    setClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard(1500));

    await act(async () => {
      await result.current.copy("first");
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.status).toBe("copied");

    await act(async () => {
      await result.current.copy("second");
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Second click restarted the timer, so it hasn't reset at the 1000ms mark yet.
    expect(result.current.status).toBe("copied");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe("idle");
  });

  it("clears the pending timer on unmount", async () => {
    setClipboard(() => Promise.resolve());
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { result, unmount } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy("value");
    });
    clearTimeoutSpy.mockClear();

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
