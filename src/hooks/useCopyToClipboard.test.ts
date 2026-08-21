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

/** A promise plus its resolver/rejecter, so a test can control exactly when it settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  it("does not let a stale request clobber a newer one that already settled", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    let call = 0;
    setClipboard(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const { result } = renderHook(() => useCopyToClipboard());

    let firstCopy!: Promise<boolean>;
    let secondCopy!: Promise<boolean>;
    act(() => {
      firstCopy = result.current.copy("first");
    });
    act(() => {
      secondCopy = result.current.copy("second");
    });

    // The newer (second) request resolves first...
    second.resolve();
    await act(async () => {
      await secondCopy;
    });
    expect(result.current.status).toBe("copied");

    // ...and the older (first) request rejects after it. Since it's stale it
    // must be ignored rather than flipping status to "error".
    first.reject(new Error("denied"));
    await act(async () => {
      await firstCopy;
    });
    expect(result.current.status).toBe("copied");
  });

  it("ignores a completion that arrives after unmount", async () => {
    const { promise, resolve } = deferred<void>();
    setClipboard(() => promise);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const { result, unmount } = renderHook(() => useCopyToClipboard());

    let copyPromise!: Promise<boolean>;
    act(() => {
      copyPromise = result.current.copy("value");
    });

    unmount();
    resolve();
    await act(async () => {
      await copyPromise;
    });

    // The write finished after teardown, so no state update or reset timer
    // should have been scheduled.
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});
