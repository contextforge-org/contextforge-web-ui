import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { ApiError } from "@/api/client";
import { I18nProvider } from "@/i18n";
import { toolsApi } from "@/api/tools";
import { useToolPreview } from "./useToolPreview";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/api/tools", () => ({
  toolsApi: { preview: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(
  toolName = "search",
  args: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return renderHook(() => useToolPreview(toolName, args, headers), {
    wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
  });
}

describe("useToolPreview", () => {
  it("captures successful preview results", async () => {
    vi.mocked(toolsApi.preview).mockResolvedValue({
      preview: { target: "local", resolved_arguments: { query: "cloudflare" } },
      status: 200,
    });
    const { result } = setup("search", { query: "cloudflare" }, { "X-Api-Key": "abc" });

    await act(async () => {
      await result.current.run();
    });

    expect(toolsApi.preview).toHaveBeenCalledWith(
      "search",
      { query: "cloudflare" },
      { "X-Api-Key": "abc" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.result?.status).toBe(200);
    expect(result.current.result?.preview.target).toBe("local");
    expect(result.current.error).toBeNull();
    expect(result.current.hasRun).toBe(true);
  });

  it("captures ApiError messages and status", async () => {
    const { toast } = await import("sonner");
    vi.mocked(toolsApi.preview).mockRejectedValue(
      new ApiError(422, { detail: "missing required argument" }, "HTTP 422"),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error?.message).toBe("missing required argument");
    expect(result.current.error?.status).toBe(422);
    expect(result.current.result).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("captures generic Error failures without a status", async () => {
    vi.mocked(toolsApi.preview).mockRejectedValue(new Error("Network failed"));
    const { result } = setup();

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.error?.message).toBe("Network failed");
    expect(result.current.error?.status).toBeNull();
    expect(result.current.hasRun).toBe(true);
  });

  it("resets result and error state when the tool name changes", async () => {
    vi.mocked(toolsApi.preview).mockResolvedValue({
      preview: { target: "local" },
      status: 200,
    });
    const { result, rerender } = renderHook(({ toolName }) => useToolPreview(toolName, {}, {}), {
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

  it("resets state and aborts in-flight requests", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(toolsApi.preview).mockImplementation((_name, _args, _headers, opts) => {
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

    expect(capturedSignal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasRun).toBe(false);
  });

  it("aborts in-flight requests on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(toolsApi.preview).mockImplementation((_name, _args, _headers, opts) => {
      capturedSignal = opts?.signal;
      return new Promise(() => {});
    });
    const { result, unmount } = setup();

    act(() => {
      void result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
