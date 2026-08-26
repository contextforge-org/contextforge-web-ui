import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { ApiError } from "@/api/client";
import { I18nProvider } from "@/i18n";
import { ToolInvokeJsonRpcError, toolsApi } from "@/api/tools";
import { TOOL_INVOKE_TIMEOUT_MS, useToolInvoke } from "./useToolInvoke";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/api/tools", async () => {
  const actual = await vi.importActual<typeof import("@/api/tools")>("@/api/tools");
  return {
    ...actual,
    toolsApi: { invoke: vi.fn(), cancelInvoke: vi.fn() },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(toolsApi.cancelInvoke).mockResolvedValue(undefined);
});

function setup(
  toolName = "search",
  args: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  timeoutMs?: number,
) {
  return renderHook(() => useToolInvoke(toolName, args, headers, timeoutMs), {
    wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
  });
}

describe("useToolInvoke", () => {
  it("captures successful live invoke results", async () => {
    vi.mocked(toolsApi.invoke).mockResolvedValue({
      id: "invoke-1",
      result: { content: [{ type: "text", text: "done", mimeType: "text/plain" }] },
      status: 200,
    });
    const { result } = setup("search", { query: "cloudflare" }, { "X-Api-Key": "abc" });

    await act(async () => {
      await result.current.run();
    });

    expect(toolsApi.invoke).toHaveBeenCalledWith(
      "search",
      { query: "cloudflare" },
      { "X-Api-Key": "abc" },
      expect.objectContaining({
        requestId: expect.stringMatching(/^tool-live-/),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.current.result?.status).toBe(200);
    expect(result.current.result?.result.content?.[0]?.text).toBe("done");
    expect(result.current.error).toBeNull();
    expect(result.current.hasRun).toBe(true);
    expect(toolsApi.cancelInvoke).not.toHaveBeenCalled();
  });

  it("captures JSON-RPC error codes and messages", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toolsApi.invoke).mockRejectedValue(
      new ToolInvokeJsonRpcError({ code: -32003, message: "Access denied" }, 200, "invoke-1"),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error?.message).toBe("Access denied");
    expect(result.current.error?.code).toBe(-32003);
    expect(result.current.error?.status).toBeNull();
    expect(result.current.result).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("captures HTTP ApiError failures", async () => {
    vi.mocked(toolsApi.invoke).mockRejectedValue(
      new ApiError(403, { detail: "Forbidden" }, "HTTP 403"),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error?.message).toBe("Forbidden");
    expect(result.current.error?.status).toBe(403);
    expect(result.current.error?.code).toBeUndefined();
  });

  it("resets result and error state when the tool name changes", async () => {
    vi.mocked(toolsApi.invoke).mockResolvedValue({
      id: "invoke-1",
      result: { content: [] },
      status: 200,
    });
    const { result, rerender } = renderHook(({ toolName }) => useToolInvoke(toolName, {}, {}), {
      initialProps: { toolName: "search" },
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });

    await act(async () => {
      await result.current.run();
    });
    expect(result.current.result).not.toBeNull();

    rerender({ toolName: "lookup" });
    await waitFor(() => expect(result.current.result).toBeNull());
    expect(result.current.error).toBeNull();
  });

  it("stopWaiting sends MCP cancellation and aborts in-flight requests", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(toolsApi.invoke).mockImplementation((_name, _args, _headers, opts) => {
      capturedSignal = opts?.signal;
      return new Promise(() => {});
    });
    const { result } = setup();

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => {
      result.current.stopWaiting();
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(toolsApi.cancelInvoke).toHaveBeenCalledWith(
      expect.stringMatching(/^tool-live-/),
      "user",
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasRun).toBe(false);
  });

  it("records timeout failures with a distinct message", async () => {
    vi.useFakeTimers();
    vi.mocked(toolsApi.invoke).mockImplementation(
      (_name, _args, _headers, opts) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted")));
        }),
    );
    const { result } = setup("search", {}, {}, TOOL_INVOKE_TIMEOUT_MS);
    let runPromise!: Promise<void>;

    act(() => {
      runPromise = result.current.run();
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(TOOL_INVOKE_TIMEOUT_MS);
      await runPromise;
    });

    expect(toolsApi.cancelInvoke).toHaveBeenCalledWith(
      expect.stringMatching(/^tool-live-/),
      "timeout",
    );
    expect(result.current.error?.timedOut).toBe(true);
    expect(result.current.error?.message).toContain("timed out");
    expect(result.current.isLoading).toBe(false);
  });

  it("reset sends best-effort cancellation for active requests", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(toolsApi.invoke).mockImplementation((_name, _args, _headers, opts) => {
      capturedSignal = opts?.signal;
      return new Promise(() => {});
    });
    const { result } = setup();

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    act(() => {
      result.current.reset();
    });

    expect(toolsApi.cancelInvoke).toHaveBeenCalledWith(
      expect.stringMatching(/^tool-live-/),
      "reset",
    );
    expect(capturedSignal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasRun).toBe(false);
  });
});
