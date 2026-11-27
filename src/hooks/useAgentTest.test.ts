import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { agentsApi } from "@/api/agents";
import { AGENT_TEST_TIMEOUT_MS } from "@/config/agentTest";
import { useAgentTest } from "./useAgentTest";

/** A call that never answers and rejects the way fetch does when it is aborted. */
function hangUntilAborted(_id: string, _query?: string, signal?: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    signal?.addEventListener("abort", () =>
      reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })),
    );
  });
}

describe("useAgentTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gives up after the wait and reports a timeout, not an agent failure", async () => {
    vi.spyOn(agentsApi, "test").mockImplementation(hangUntilAborted);
    const { result } = renderHook(() => useAgentTest("agent-1"));

    await act(async () => {
      void result.current.run("ping");
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_TEST_TIMEOUT_MS);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.failure).toMatchObject({ timedOut: true, status: null });
    expect(result.current.outcome).toBeNull();
    expect(result.current.elapsedMs).not.toBeNull();
  });

  it("keeps waiting until the limit", async () => {
    vi.spyOn(agentsApi, "test").mockImplementation(hangUntilAborted);
    const { result } = renderHook(() => useAgentTest("agent-1"));

    await act(async () => {
      void result.current.run();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_TEST_TIMEOUT_MS - 1);
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.failure).toBeNull();
  });

  it("reports nothing when the caller stops waiting, and the limit no longer fires", async () => {
    vi.spyOn(agentsApi, "test").mockImplementation(hangUntilAborted);
    const { result } = renderHook(() => useAgentTest("agent-1"));

    await act(async () => {
      void result.current.run();
    });
    await act(async () => {
      result.current.stopWaiting();
      await vi.advanceTimersByTimeAsync(AGENT_TEST_TIMEOUT_MS * 2);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.failure).toBeNull();
    expect(result.current.outcome).toBeNull();
  });

  it("uses the timeout it is given", async () => {
    vi.spyOn(agentsApi, "test").mockImplementation(hangUntilAborted);
    const { result } = renderHook(() => useAgentTest("agent-1", { timeoutMs: 5_000 }));

    await act(async () => {
      void result.current.run();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(result.current.failure).toMatchObject({ timedOut: true });
  });

  it("starts a second call clean after a timeout", async () => {
    const spy = vi.spyOn(agentsApi, "test").mockImplementationOnce(hangUntilAborted);
    const { result } = renderHook(() => useAgentTest("agent-1", { timeoutMs: 1_000 }));

    await act(async () => {
      void result.current.run();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(result.current.failure?.timedOut).toBe(true);

    spy.mockResolvedValueOnce({
      success: true,
      result: { message: { role: "ROLE_AGENT", parts: [{ text: "pong" }] } },
      agent_name: "a",
      test_timestamp: 1,
    });
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.failure).toBeNull();
    expect(result.current.outcome).toMatchObject({ kind: "success", text: "pong" });
  });
});
