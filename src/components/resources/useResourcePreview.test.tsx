import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { useResourcePreview } from "./useResourcePreview";
import { resourcesApi } from "@/api/resources";
import { ApiError } from "@/api/client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/api/resources", () => ({
  resourcesApi: { test: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(uri = "file:///a.txt") {
  return renderHook(() => useResourcePreview(uri), {
    wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
  });
}

describe("useResourcePreview", () => {
  it("starts in an idle state with no result and no error", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      isLoading: false,
      result: null,
      error: null,
      hasRun: false,
    });
  });

  it("captures a successful run with a measured renderTimeMs and the HTTP status", async () => {
    vi.mocked(resourcesApi.test).mockResolvedValue({
      content: { mimeType: "text/plain", text: "hello" },
      status: 200,
    });
    const { result } = setup("file:///a.txt");

    await act(async () => {
      await result.current.run();
    });

    expect(resourcesApi.test).toHaveBeenCalledWith(
      "file:///a.txt",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.content).toEqual({ mimeType: "text/plain", text: "hello" });
    expect(result.current.result?.renderTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.current.result?.status).toBe(200);
    expect(result.current.hasRun).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("unwraps ApiError.detail into a readable failure message, captures the status, and toasts", async () => {
    const { toast } = await import("sonner");
    vi.mocked(resourcesApi.test).mockRejectedValue(
      new ApiError(404, { detail: "Resource not found" }, "Not Found"),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error?.message).toBe("Resource not found");
    expect(result.current.error?.status).toBe(404);
    expect(result.current.result).toBeNull();
    expect(result.current.hasRun).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("leaves error.status as null for non-Api errors (e.g. network failures)", async () => {
    vi.mocked(resourcesApi.test).mockRejectedValue(new Error("network offline"));
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error?.message).toBe("network offline");
    expect(result.current.error?.status).toBeNull();
  });

  it("falls back to a generic message when a non-Error value is thrown", async () => {
    vi.mocked(resourcesApi.test).mockRejectedValue("just a string");
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error?.message).toBe("Unknown error");
    expect(result.current.error?.status).toBeNull();
  });

  it("swallows a rejection from an aborted request instead of setting error state", async () => {
    let reject: ((err: unknown) => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(resourcesApi.test).mockImplementation((_uri, opts) => {
      capturedSignal = opts?.signal;
      return new Promise((_res, rej) => {
        reject = rej;
      });
    });
    const { toast } = await import("sonner");
    const { result } = setup();

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => {
      result.current.reset(); // aborts the in-flight request
    });
    expect(capturedSignal?.aborted).toBe(true);

    // The underlying fetch settles with an AbortError after the abort — the
    // stale rejection must not repopulate error state or toast.
    reject?.(new DOMException("The operation was aborted", "AbortError"));
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("clears result and error when uri changes", async () => {
    vi.mocked(resourcesApi.test).mockResolvedValue({
      content: { mimeType: "text/plain", text: "hello" },
      status: 200,
    });
    const { result, rerender } = renderHook(({ uri }: { uri: string }) => useResourcePreview(uri), {
      initialProps: { uri: "file:///a.txt" },
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.hasRun).toBe(true);

    rerender({ uri: "file:///b.txt" });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.hasRun).toBe(false);
  });

  it("aborts an in-flight preview when the hook unmounts and drops the late resolution", async () => {
    let resolve: ((v: { content: { text: string }; status: number }) => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(resourcesApi.test).mockImplementation((_uri, opts) => {
      capturedSignal = opts?.signal;
      return new Promise((r) => {
        resolve = r;
      });
    });
    const { toast } = await import("sonner");
    const { result, unmount } = setup();

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);

    // Late resolution after unmount must not toast or otherwise surface.
    resolve?.({ content: { text: "hello" }, status: 200 });
    await new Promise((r) => setTimeout(r, 0));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("aborts the previous request when run() is called again before it settles", async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(resourcesApi.test).mockImplementation(
      (_uri, opts) =>
        new Promise((r) => {
          if (opts?.signal) signals.push(opts.signal);
          setTimeout(() => r({ content: { text: "hello" }, status: 200 }), 0);
        }),
    );
    const { result } = setup();

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(signals).toHaveLength(1));

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(signals).toHaveLength(2));

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("flips isLoading while the request is in flight", async () => {
    let resolve: ((value: { content: { text: string }; status: number }) => void) | undefined;
    vi.mocked(resourcesApi.test).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = setup();

    let pending: Promise<void>;
    act(() => {
      pending = result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    resolve?.({ content: { text: "hello" }, status: 200 });
    await act(async () => {
      await pending!;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("reset() clears a completed run so hasRun returns to false", async () => {
    vi.mocked(resourcesApi.test).mockResolvedValue({
      content: { mimeType: "text/plain", text: "hello" },
      status: 200,
    });
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.hasRun).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.hasRun).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("reset() clears a captured error", async () => {
    vi.mocked(resourcesApi.test).mockRejectedValue(new Error("boom"));
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.hasRun).toBe(false);
  });

  it("reset() aborts an in-flight request and clears isLoading", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolve: ((v: { content: { text: string }; status: number }) => void) | undefined;
    vi.mocked(resourcesApi.test).mockImplementation((_uri, opts) => {
      capturedSignal = opts?.signal;
      return new Promise((r) => {
        resolve = r;
      });
    });
    const { result } = setup();

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(capturedSignal?.aborted).toBe(false);

    act(() => {
      result.current.reset();
    });
    expect(capturedSignal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();

    // Late resolution after reset must not repopulate state.
    resolve?.({ content: { text: "hello" }, status: 200 });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.result).toBeNull();
    expect(result.current.hasRun).toBe(false);
  });
});
