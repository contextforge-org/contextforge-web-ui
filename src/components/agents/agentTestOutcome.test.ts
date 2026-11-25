import { describe, expect, it } from "vitest";

import { interpretTestFailure, interpretTestResult, normalizeTaskState } from "./agentTestOutcome";

describe("normalizeTaskState", () => {
  it("reads v1 and earlier spellings as one state", () => {
    expect(normalizeTaskState("TASK_STATE_INPUT_REQUIRED")).toBe("input-required");
    expect(normalizeTaskState("input-required")).toBe("input-required");
    expect(normalizeTaskState("input_required")).toBe("input-required");
    expect(normalizeTaskState("TASK_STATE_COMPLETED")).toBe("completed");
    expect(normalizeTaskState("completed")).toBe("completed");
  });

  it("returns null for anything that is not a state", () => {
    expect(normalizeTaskState(undefined)).toBeNull();
    expect(normalizeTaskState("")).toBeNull();
    expect(normalizeTaskState(3)).toBeNull();
  });
});

describe("interpretTestResult", () => {
  it("reads a v1 message", () => {
    expect(
      interpretTestResult({ message: { role: "ROLE_AGENT", parts: [{ text: "Hello" }] } }),
    ).toEqual({ kind: "success", text: "Hello", rawRole: "ROLE_AGENT", task: null });
  });

  it("reads an earlier message with a kind on each part", () => {
    expect(
      interpretTestResult({
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "Hello" }],
      }),
    ).toEqual({ kind: "success", text: "Hello", rawRole: "agent", task: null });
  });

  it("reads the answer inside a JSON-RPC envelope", () => {
    expect(
      interpretTestResult({
        jsonrpc: "2.0",
        id: 1,
        result: { message: { role: "ROLE_AGENT", parts: [{ text: "Hi" }] } },
      }),
    ).toMatchObject({ kind: "success", text: "Hi" });
  });

  it("reads a v1 task with its artifacts", () => {
    expect(
      interpretTestResult({
        task: {
          id: "t-1",
          status: { state: "TASK_STATE_COMPLETED" },
          artifacts: [{ parts: [{ text: "Done" }] }],
        },
      }),
    ).toEqual({
      kind: "success",
      text: "Done",
      rawRole: null,
      task: { id: "t-1", rawState: "TASK_STATE_COMPLETED", state: "completed" },
    });
  });

  it("shows a reply once when a task says it in both its status and an artifact", () => {
    expect(
      interpretTestResult({
        task: {
          id: "t-3",
          status: {
            state: "TASK_STATE_COMPLETED",
            message: { role: "ROLE_AGENT", parts: [{ text: "Echo: test" }] },
          },
          artifacts: [{ parts: [{ text: "Echo: test" }] }],
        },
      }),
    ).toMatchObject({ kind: "success", text: "Echo: test" });
  });

  it("keeps different texts from a task's status and artifacts", () => {
    expect(
      interpretTestResult({
        task: {
          id: "t-4",
          status: { state: "completed", message: { parts: [{ text: "Working" }] } },
          artifacts: [{ parts: [{ text: "Done" }] }],
        },
      }),
    ).toMatchObject({ text: "Working\n\nDone" });
  });

  it("reads an earlier task that is the result itself", () => {
    expect(
      interpretTestResult({ kind: "task", id: "t-2", status: { state: "completed" } }),
    ).toMatchObject({ kind: "success", task: { id: "t-2", state: "completed" } });
  });

  it("shows a JSON-RPC error in the result as a failure, with its code and message", () => {
    expect(
      interpretTestResult({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "No method" } }),
    ).toEqual({ kind: "failure", code: -32601, message: "No method", rawRole: null, task: null });
  });

  it("treats an error that is null as an empty result", () => {
    expect(interpretTestResult({ error: null })).toEqual({ kind: "empty" });
  });

  it("treats a missing or empty result as empty", () => {
    expect(interpretTestResult(null)).toEqual({ kind: "empty" });
    expect(interpretTestResult(undefined)).toEqual({ kind: "empty" });
    expect(interpretTestResult({})).toEqual({ kind: "empty" });
  });

  it("shows an error the gateway sends as a plain message as a failure", () => {
    expect(interpretTestResult({ error: "Nothing to forward" })).toMatchObject({
      kind: "failure",
      code: null,
      message: "Nothing to forward",
    });
  });

  it.each([
    ["TASK_STATE_INPUT_REQUIRED", "input"],
    ["input-required", "input"],
    ["TASK_STATE_AUTH_REQUIRED", "auth"],
    ["auth-required", "auth"],
  ] as const)("shows %s as waiting, not success or failure", (state, waitingFor) => {
    expect(interpretTestResult({ task: { id: "t", status: { state } } })).toMatchObject({
      kind: "waiting",
      waitingFor,
    });
  });

  it.each(["TASK_STATE_FAILED", "failed", "TASK_STATE_REJECTED", "rejected"])(
    "shows a task in %s as a failure",
    (state) => {
      expect(
        interpretTestResult({
          task: { id: "t", status: { state, message: { parts: [{ text: "Nope" }] } } },
        }),
      ).toMatchObject({ kind: "failure", message: "Nope", task: { id: "t" } });
    },
  );

  it("still succeeds for a reply shape it does not know", () => {
    expect(interpretTestResult({ echo: "pong" })).toEqual({
      kind: "success",
      text: null,
      rawRole: null,
      task: null,
    });
  });

  it("uses a string result as the reply", () => {
    expect(interpretTestResult("pong")).toMatchObject({ kind: "success", text: "pong" });
  });
});

describe("interpretTestFailure", () => {
  const apiError = (status: number, body: unknown) =>
    Object.assign(new Error(`HTTP ${status}`), { status, body });

  it("reads error_type and the message from the failure body", () => {
    expect(
      interpretTestFailure(
        apiError(502, {
          detail: {
            success: false,
            error: "A2A agent invocation failed",
            error_type: "agent_error",
            agent_id: "a1",
          },
        }),
      ),
    ).toEqual({
      errorType: "agent_error",
      message: "A2A agent invocation failed",
      status: 502,
      timedOut: false,
    });
  });

  it("reads the list FastAPI returns for a body that fails validation", () => {
    expect(
      interpretTestFailure(apiError(422, { detail: [{ msg: "String too long" }] })),
    ).toMatchObject({ errorType: null, message: "String too long", status: 422 });
  });

  it("reads a string detail", () => {
    expect(
      interpretTestFailure(apiError(503, { detail: "A2A service not available" })),
    ).toMatchObject({ message: "A2A service not available", status: 503 });
  });

  // IBM/mcp-context-forge#7685: the backend answers a read timeout with 504 and error_type "timeout".
  it("marks a timeout by error_type, by 504, or by the wait running out", () => {
    expect(
      interpretTestFailure(apiError(502, { detail: { error: "x", error_type: "timeout" } }))
        .timedOut,
    ).toBe(true);
    expect(interpretTestFailure(apiError(504, null)).timedOut).toBe(true);
    expect(interpretTestFailure(new Error("aborted"), { timedOut: true }).timedOut).toBe(true);
  });

  it("does not mark an agent failure as a timeout", () => {
    expect(
      interpretTestFailure(apiError(502, { detail: { error: "x", error_type: "agent_error" } }))
        .timedOut,
    ).toBe(false);
  });

  it("copes with an error that has no body", () => {
    expect(interpretTestFailure(new Error("network"))).toEqual({
      errorType: null,
      message: null,
      status: null,
      timedOut: false,
    });
  });
});
