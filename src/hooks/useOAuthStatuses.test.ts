import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOAuthStatuses, type OAuthStatusBatchResult } from "@/api/oauth";
import { useOAuthStatuses } from "./useOAuthStatuses";

vi.mock("@/api/oauth", () => ({
  getOAuthStatuses: vi.fn(),
}));

const mockGetOAuthStatuses = vi.mocked(getOAuthStatuses);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function statusResult(
  id: string,
  tokenStatus: "valid" | "near_expiry" | "expired" | "missing" | "unknown",
): OAuthStatusBatchResult {
  return {
    statuses: {
      [id]: {
        oauth_enabled: true,
        grant_type: "authorization_code",
        user_token_status: { status: tokenStatus, authorized: tokenStatus === "valid" },
      },
    },
    failures: {},
  };
}

describe("useOAuthStatuses", () => {
  beforeEach(() => {
    mockGetOAuthStatuses.mockReset();
  });

  it("starts each requested ID in loading state", () => {
    mockGetOAuthStatuses.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useOAuthStatuses(["gateway-1"]));

    expect(result.current.entries["gateway-1"]).toEqual({ state: "loading" });
  });

  it.each(["valid", "near_expiry", "expired", "missing"] as const)(
    "maps backend %s status to a ready entry",
    async (tokenStatus) => {
      mockGetOAuthStatuses.mockResolvedValue(statusResult("gateway-1", tokenStatus));
      const { result } = renderHook(() => useOAuthStatuses(["gateway-1"]));

      await waitFor(() =>
        expect(result.current.entries["gateway-1"]).toMatchObject({
          state: "ready",
          tokenStatus,
        }),
      );
    },
  );

  it("treats backend unknown and omitted results as unavailable", async () => {
    mockGetOAuthStatuses.mockResolvedValueOnce(statusResult("unknown", "unknown"));
    const { result, rerender } = renderHook(({ ids }) => useOAuthStatuses(ids), {
      initialProps: { ids: ["unknown"] },
    });

    await waitFor(() =>
      expect(result.current.entries.unknown).toEqual({ state: "unavailable", retryable: true }),
    );

    mockGetOAuthStatuses.mockResolvedValueOnce({ statuses: {}, failures: {} });
    rerender({ ids: ["omitted"] });
    await waitFor(() =>
      expect(result.current.entries.omitted).toEqual({ state: "unavailable", retryable: true }),
    );
  });

  it("marks non-authorization-code grants not applicable", async () => {
    mockGetOAuthStatuses.mockResolvedValue({
      statuses: {
        gateway: { oauth_enabled: true, grant_type: "client_credentials" },
      },
      failures: {},
    });
    const { result } = renderHook(() => useOAuthStatuses(["gateway"]));

    await waitFor(() =>
      expect(result.current.entries.gateway).toMatchObject({ state: "not_applicable" }),
    );
  });

  it("removes IDs that are no longer requested", async () => {
    mockGetOAuthStatuses.mockResolvedValue(statusResult("one", "valid"));
    const { result, rerender } = renderHook(({ ids }) => useOAuthStatuses(ids), {
      initialProps: { ids: ["one"] },
    });
    await waitFor(() => expect(result.current.entries.one?.state).toBe("ready"));

    rerender({ ids: [] });

    await waitFor(() => expect(result.current.entries).toEqual({}));
  });

  it("clears a cached value to loading while reloading", async () => {
    const reload = deferred<OAuthStatusBatchResult>();
    mockGetOAuthStatuses
      .mockResolvedValueOnce(statusResult("gateway", "valid"))
      .mockReturnValueOnce(reload.promise);
    const { result } = renderHook(() => useOAuthStatuses(["gateway"]));
    await waitFor(() => expect(result.current.entries.gateway?.state).toBe("ready"));

    let reloadPromise!: Promise<void>;
    act(() => {
      reloadPromise = result.current.reload(["gateway"]);
    });
    expect(result.current.entries.gateway).toEqual({ state: "loading" });

    reload.resolve(statusResult("gateway", "missing"));
    await act(async () => reloadPromise);
    expect(result.current.entries.gateway).toMatchObject({
      state: "ready",
      tokenStatus: "missing",
    });
  });

  it("prevents an older response from overwriting a newer response", async () => {
    const oldRequest = deferred<OAuthStatusBatchResult>();
    const newRequest = deferred<OAuthStatusBatchResult>();
    mockGetOAuthStatuses
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const { result } = renderHook(() => useOAuthStatuses(["gateway"]));

    let reloadPromise!: Promise<void>;
    act(() => {
      reloadPromise = result.current.reload(["gateway"]);
    });
    newRequest.resolve(statusResult("gateway", "missing"));
    await act(async () => reloadPromise);

    oldRequest.resolve(statusResult("gateway", "valid"));
    await act(async () => oldRequest.promise);
    expect(result.current.entries.gateway).toMatchObject({
      state: "ready",
      tokenStatus: "missing",
    });
  });

  it("retries one retryable unavailable ID without clearing other IDs", async () => {
    mockGetOAuthStatuses
      .mockResolvedValueOnce({
        statuses: {},
        failures: {
          one: { retryable: true, status: 500 },
          two: { retryable: true, status: 500 },
        },
      })
      .mockResolvedValueOnce(statusResult("one", "valid"));
    const { result } = renderHook(() => useOAuthStatuses(["one", "two"]));
    await waitFor(() => expect(result.current.entries.two?.state).toBe("unavailable"));

    await act(async () => result.current.retry("one"));

    expect(mockGetOAuthStatuses).toHaveBeenLastCalledWith(["one"], expect.any(AbortSignal));
    expect(result.current.entries.one?.state).toBe("ready");
    expect(result.current.entries.two?.state).toBe("unavailable");
  });

  it("keeps 403 failures unavailable and non-retryable", async () => {
    mockGetOAuthStatuses.mockResolvedValue({
      statuses: {},
      failures: { gateway: { retryable: false, status: 403 } },
    });
    const { result } = renderHook(() => useOAuthStatuses(["gateway"]));

    await waitFor(() =>
      expect(result.current.entries.gateway).toEqual({
        state: "unavailable",
        retryable: false,
        statusCode: 403,
      }),
    );
  });
});
