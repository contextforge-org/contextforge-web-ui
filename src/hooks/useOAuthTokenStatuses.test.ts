import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { serversApi } from "@/api/servers";
import { useOAuthTokenStatuses } from "./useOAuthTokenStatuses";

type StatusResponse = Awaited<ReturnType<typeof serversApi.getOAuthStatus>>;

const oauthServer = (id: string) => ({ id, authType: "oauth" });

const tokenStatus = (id: string, status: string): StatusResponse =>
  ({ [id]: { user_token_status: { status } } }) as unknown as StatusResponse;

describe("useOAuthTokenStatuses", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries only OAuth servers", async () => {
    const getOAuthStatus = vi
      .spyOn(serversApi, "getOAuthStatus")
      .mockResolvedValue(tokenStatus("a", "missing"));

    const { result } = renderHook(() =>
      useOAuthTokenStatuses([oauthServer("a"), { id: "b", authType: "basic" }]),
    );

    await waitFor(() => {
      expect(result.current.oauthTokenStatuses).toEqual({ a: "missing" });
    });
    expect(getOAuthStatus).toHaveBeenCalledWith(["a"]);
  });

  it("makes no request when no server has a token", async () => {
    const getOAuthStatus = vi.spyOn(serversApi, "getOAuthStatus");

    renderHook(() => useOAuthTokenStatuses([{ id: "b", authType: "basic" }]));

    await waitFor(() => {
      expect(getOAuthStatus).not.toHaveBeenCalled();
    });
  });

  it("ignores a lookup that resolves after a newer one", async () => {
    let resolveFirst: (value: StatusResponse) => void = () => {};
    vi.spyOn(serversApi, "getOAuthStatus")
      .mockImplementationOnce(
        () =>
          new Promise<StatusResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...tokenStatus("a", "missing"),
        ...tokenStatus("b", "expired"),
      });

    const { result, rerender } = renderHook(({ servers }) => useOAuthTokenStatuses(servers), {
      initialProps: { servers: [oauthServer("a")] },
    });

    rerender({ servers: [oauthServer("a"), oauthServer("b")] });

    await waitFor(() => {
      expect(result.current.oauthTokenStatuses).toEqual({ a: "missing", b: "expired" });
    });

    await act(async () => {
      resolveFirst(tokenStatus("a", "valid"));
    });

    expect(result.current.oauthTokenStatuses).toEqual({ a: "missing", b: "expired" });
  });

  it("keeps the last known statuses when a reload fails", async () => {
    vi.spyOn(serversApi, "getOAuthStatus")
      .mockResolvedValueOnce(tokenStatus("a", "missing"))
      .mockRejectedValueOnce(new Error("Service down"));

    const { result } = renderHook(() => useOAuthTokenStatuses([oauthServer("a")]));

    await waitFor(() => {
      expect(result.current.oauthTokenStatuses).toEqual({ a: "missing" });
    });

    await result.current.reloadOAuthStatuses();

    expect(result.current.oauthTokenStatuses).toEqual({ a: "missing" });
  });
});
