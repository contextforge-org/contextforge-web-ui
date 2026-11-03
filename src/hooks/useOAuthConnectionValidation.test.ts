import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "@/api/client";
import { serversApi } from "@/api/servers";
import type { GatewayHandshakeResponse } from "@/generated/types";
import { useOAuthConnectionValidation } from "./useOAuthConnectionValidation";

vi.mock("@/api/servers", () => ({ serversApi: { testOAuthConnection: vi.fn() } }));
const success: GatewayHandshakeResponse = {
  success: true,
  latencyMs: 5,
  stages: { token: "ok", negotiation: "ok", tools_list: "ok" },
  componentCounts: { tools: 0 },
};
const target = { gatewayId: "gw-1", baseUrl: "https://saved.example/mcp" };
const mockTest = vi.mocked(serversApi.testOAuthConnection);

beforeEach(() => {
  mockTest.mockReset();
});

describe("useOAuthConnectionValidation", () => {
  it("only runs on demand and accepts zero tools without any mutation calls", async () => {
    mockTest.mockResolvedValue(success);
    const { result } = renderHook(() => useOAuthConnectionValidation());
    expect(mockTest).not.toHaveBeenCalled();
    await act(() => result.current.test("gw-1", target));
    expect(mockTest).toHaveBeenCalledExactlyOnceWith(target, expect.any(AbortSignal));
    expect(result.current.entries["gw-1"]).toMatchObject({
      state: "success",
      result: success,
      testedAt: expect.any(Number),
    });
  });

  it.each([
    { success: true, latencyMs: 1 },
    { ...success, stages: { token: "ok", negotiation: "ok" } },
    null,
  ] as GatewayHandshakeResponse[])(
    "rejects responses without complete stage evidence: %j",
    async (response) => {
      mockTest.mockResolvedValue(response);
      const { result } = renderHook(() => useOAuthConnectionValidation());
      await act(() => result.current.test("gw-1", target));
      expect(result.current.entries["gw-1"]).toMatchObject({
        state: "failure",
        errorCode: "incompatible",
      });
    },
  );

  it.each(["failed", "skipped", "unsupported"] as const)(
    "does not report success for a %s listing",
    async (status) => {
      mockTest.mockResolvedValue({
        ...success!,
        stages: { token: "ok", negotiation: "ok", tools_list: status },
      });
      const { result } = renderHook(() => useOAuthConnectionValidation());
      await act(() => result.current.test("gw-1", target));
      expect(result.current.entries["gw-1"].state).toBe("failure");
    },
  );

  it("preserves HTTP-200 validation failures and reauthorization guidance", async () => {
    const response: GatewayHandshakeResponse = {
      ...success!,
      success: false,
      stages: { token: "ok", negotiation: "ok", tools_list: "failed" },
      errorCode: "insufficient_scope",
      failedStage: "tools_list",
      reauthorizationRequired: true,
    };
    mockTest.mockResolvedValue(response);
    const { result } = renderHook(() => useOAuthConnectionValidation());
    await act(() => result.current.test("gw-1", target));
    expect(result.current.entries["gw-1"]).toMatchObject({
      state: "failure",
      result: response,
      errorCode: "insufficient_scope",
    });
  });

  it.each([
    [403, "permission_denied"],
    [422, "request_invalid"],
    [429, "rate_limited"],
    [500, "generic"],
  ])("maps HTTP %s without automatic retry", async (status, code) => {
    mockTest.mockRejectedValue(new ApiError(status as number, null, "unsafe upstream body"));
    const { result } = renderHook(() => useOAuthConnectionValidation());
    await act(() => result.current.test("gw-1", target));
    expect(result.current.entries["gw-1"]).toMatchObject({ state: "failure", errorCode: code });
    expect(mockTest).toHaveBeenCalledTimes(1);
  });

  it("deduplicates, cancels and ignores late responses after a replacement test", async () => {
    let finish!: (response: GatewayHandshakeResponse) => void;
    mockTest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useOAuthConnectionValidation());
    let first!: Promise<void>;
    act(() => {
      first = result.current.test("gw-1", target);
    });
    await act(() => result.current.test("gw-1", target));
    expect(mockTest).toHaveBeenCalledTimes(1);
    const signal = mockTest.mock.calls[0][1]!;
    act(() => result.current.reset("gw-1"));
    expect(signal.aborted).toBe(true);
    mockTest.mockResolvedValue(success);
    await act(() => result.current.test("gw-1", target));
    await act(async () => {
      finish(null);
      await first;
    });
    expect(result.current.entries["gw-1"].state).toBe("success");
  });

  it("resets on configuration change and aborts on permission loss and unmount", async () => {
    mockTest.mockImplementation(() => new Promise(() => {}));
    const { result, rerender, unmount } = renderHook(
      ({ enabled, key }) => useOAuthConnectionValidation(enabled, { "gw-1": key }),
      { initialProps: { enabled: true, key: "old" } },
    );
    act(() => {
      void result.current.test("gw-1", target);
    });
    rerender({ enabled: true, key: "new" });
    expect(mockTest.mock.calls[0][1]?.aborted).toBe(true);
    expect(result.current.entries).toEqual({});
    act(() => {
      void result.current.test("gw-1", target);
    });
    rerender({ enabled: false, key: "new" });
    expect(mockTest.mock.calls[1][1]?.aborted).toBe(true);
    expect(result.current.entries).toEqual({});
    await act(() => result.current.test("gw-1", target));
    expect(mockTest).toHaveBeenCalledTimes(2);
    rerender({ enabled: true, key: "new" });
    act(() => {
      void result.current.test("gw-1", target);
    });
    unmount();
    expect(mockTest.mock.calls[2][1]?.aborted).toBe(true);
  });

  it("cancels while resolving the saved gateway before any handshake request", async () => {
    let finish!: (value: typeof target) => void;
    const resolver = vi.fn(
      () =>
        new Promise<typeof target>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useOAuthConnectionValidation());
    let request!: Promise<void>;
    act(() => {
      request = result.current.test("gw-1", resolver);
    });
    act(() => result.current.reset("gw-1"));
    await act(async () => {
      finish(target);
      await request;
    });
    expect(mockTest).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual({});
  });
});
