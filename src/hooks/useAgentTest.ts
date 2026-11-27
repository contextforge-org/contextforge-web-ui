import { useCallback, useEffect, useRef, useState } from "react";

import { agentsApi } from "@/api/agents";
import { AGENT_TEST_TIMEOUT_MS } from "@/config/agentTest";
import {
  interpretTestFailure,
  interpretTestResult,
  type AgentTestFailure,
  type AgentTestOutcome,
} from "@/components/agents/agentTestOutcome";

export interface AgentTestState {
  run: (query?: string) => Promise<void>;
  reset: () => void;
  /** Gives up waiting. The agent may still receive the call. */
  stopWaiting: () => void;
  isLoading: boolean;
  /** What the agent answered, once the call succeeded. */
  outcome: AgentTestOutcome | null;
  /** Why the call failed, when it did. */
  failure: AgentTestFailure | null;
  /** Wall-clock time of the call, in milliseconds. */
  elapsedMs: number | null;
}

/** Runs `POST /v1/a2a/{id}/test` for one agent, keeping at most one call in flight. */
export function useAgentTest(
  agentId: string,
  { timeoutMs = AGENT_TEST_TIMEOUT_MS }: { timeoutMs?: number } = {},
): AgentTestState {
  const [isLoading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<AgentTestOutcome | null>(null);
  const [failure, setFailure] = useState<AgentTestFailure | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timedOutRef = useRef(false);

  const abortCurrent = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abortCurrent();
    timedOutRef.current = false;
    setOutcome(null);
    setFailure(null);
    setElapsedMs(null);
    setLoading(false);
  }, [abortCurrent]);

  const stopWaiting = useCallback(() => {
    abortCurrent();
    setLoading(false);
  }, [abortCurrent]);

  // A different agent starts clean; leaving drops the call in flight.
  useEffect(() => {
    reset();
    return abortCurrent;
  }, [agentId, reset, abortCurrent]);

  const run = useCallback(
    async (query?: string) => {
      abortCurrent();
      const controller = new AbortController();
      abortRef.current = controller;
      timedOutRef.current = false;
      timerRef.current = setTimeout(() => {
        timedOutRef.current = true;
        controller.abort();
      }, timeoutMs);

      setLoading(true);
      setOutcome(null);
      setFailure(null);
      const startedAt = performance.now();
      try {
        const response = await agentsApi.test(agentId, query, controller.signal);
        if (controller.signal.aborted && !timedOutRef.current) return;
        setElapsedMs(Math.round(performance.now() - startedAt));
        setOutcome(interpretTestResult(response?.result));
      } catch (err) {
        // Stopped by the user or by leaving: nothing to report.
        if (controller.signal.aborted && !timedOutRef.current) return;
        setElapsedMs(Math.round(performance.now() - startedAt));
        setFailure(interpretTestFailure(err, { timedOut: timedOutRef.current }));
      } finally {
        if (abortRef.current === controller) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [abortCurrent, agentId, timeoutMs],
  );

  return { run, reset, stopWaiting, isLoading, outcome, failure, elapsedMs };
}
