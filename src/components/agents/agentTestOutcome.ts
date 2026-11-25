/**
 * Reads the reply to `POST /v1/a2a/{agent_id}/test`.
 *
 * `result` relays the agent's own document, so its shape depends on the A2A
 * protocol version the agent speaks: v1 uses `TASK_STATE_*` and `ROLE_*` and
 * bare parts, earlier versions use lowercase states and a `kind` on each part.
 * Nothing here trusts the shape: anything unexpected falls back to the raw
 * document rather than throwing.
 */

export interface AgentTestTask {
  id: string | null;
  /** The state as the agent sent it, e.g. `TASK_STATE_COMPLETED` or `completed`. */
  rawState: string | null;
  /** The state in one spelling for every protocol version, e.g. `input-required`. */
  state: string | null;
}

export type AgentTestOutcome =
  /** The agent answered. */
  | {
      kind: "success";
      text: string | null;
      /** The role as the agent sent it, e.g. `ROLE_AGENT` or `agent`. */
      rawRole: string | null;
      task: AgentTestTask | null;
    }
  /** The agent answered that it needs input or authorization: neither success nor failure. */
  | {
      kind: "waiting";
      waitingFor: "input" | "auth";
      text: string | null;
      rawRole: string | null;
      task: AgentTestTask | null;
    }
  /** The HTTP call succeeded but the agent reported an error in the reply. */
  | {
      kind: "failure";
      code: number | string | null;
      message: string;
      rawRole: string | null;
      task: AgentTestTask | null;
    }
  /** The HTTP call succeeded and there was nothing in the reply. */
  | { kind: "empty" };

/** Why a test call failed before the agent gave an answer. */
export interface AgentTestFailure {
  /** `detail.error_type` from the failure body, when there was one. */
  errorType: string | null;
  message: string | null;
  status: number | null;
  /** The agent, or the wait for it, ran out of time. */
  timedOut: boolean;
}

/** Task states that mean the agent could not do what was asked. */
const FAILED_TASK_STATES = new Set(["failed", "rejected"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** `TASK_STATE_INPUT_REQUIRED`, `input_required` and `input-required` are one state. */
export function normalizeTaskState(raw: unknown): string | null {
  const text = asString(raw);
  if (!text) return null;
  return text
    .trim()
    .toLowerCase()
    .replace(/^task_state_/, "")
    .replace(/_/g, "-");
}

/** The text of a message's parts. Other kinds of part (files, data) are left to the raw document. */
function partsText(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;
  const texts = parts
    .map((part) => (isRecord(part) ? asString(part.text) : null))
    .filter((text): text is string => text !== null);
  return texts.length > 0 ? texts.join("\n\n") : null;
}

/**
 * One text from several places in the reply. A task often carries its answer twice, in
 * the status message and again as an artifact, so a chunk that repeats an earlier one is
 * left out.
 */
function joinText(chunks: Array<string | null>): string | null {
  const texts = chunks.filter(
    (text, index): text is string =>
      text !== null && chunks.findIndex((other) => other?.trim() === text.trim()) === index,
  );
  return texts.length > 0 ? texts.join("\n\n") : null;
}

function readTask(body: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(body.task)) return body.task;
  // v0.3 returns the task itself, marked by `kind`; other agents may omit the marker.
  if (body.kind === "task" || (isRecord(body.status) && typeof body.id === "string")) return body;
  return null;
}

function readMessage(body: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(body.message)) return body.message;
  if (Array.isArray(body.parts) && body.role !== undefined) return body;
  return null;
}

/** Whether the document says anything, once a JSON-RPC envelope's bookkeeping keys are set aside. */
function hasContent(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => key !== "jsonrpc" && key !== "id" && key !== "error");
}

export function interpretTestResult(result: unknown): AgentTestOutcome {
  if (result === null || result === undefined || result === "") return { kind: "empty" };
  if (typeof result === "string")
    return { kind: "success", text: result, rawRole: null, task: null };
  if (!isRecord(result)) return { kind: "success", text: null, rawRole: null, task: null };

  // HTTP 200 does not mean the agent succeeded: a JSON-RPC error rides in `result`.
  const error = result.error;
  if (isRecord(error)) {
    const code =
      typeof error.code === "number" || typeof error.code === "string" ? error.code : null;
    return {
      kind: "failure",
      code,
      message: asString(error.message) ?? "",
      rawRole: null,
      task: null,
    };
  }
  // The gateway forwards an empty reply as `{"error": null}`; a plain string is its own message.
  if (typeof error === "string" && error.trim()) {
    return { kind: "failure", code: null, message: error, rawRole: null, task: null };
  }

  // A JSON-RPC envelope carries the answer under `result`.
  const body = isRecord(result.result) ? result.result : result;
  if (!hasContent(body)) return { kind: "empty" };

  const taskDoc = readTask(body);
  const messageDoc = readMessage(body);

  const rawState = taskDoc && isRecord(taskDoc.status) ? asString(taskDoc.status.state) : null;
  const task: AgentTestTask | null = taskDoc
    ? { id: asString(taskDoc.id), rawState, state: normalizeTaskState(rawState) }
    : null;

  const statusMessage = taskDoc && isRecord(taskDoc.status) ? taskDoc.status.message : undefined;
  const artifactText = Array.isArray(taskDoc?.artifacts)
    ? joinText(
        taskDoc.artifacts.map((artifact) =>
          isRecord(artifact) ? partsText(artifact.parts) : null,
        ),
      )
    : null;
  const text = joinText([
    messageDoc ? partsText(messageDoc.parts) : null,
    isRecord(statusMessage) ? partsText(statusMessage.parts) : null,
    artifactText,
  ]);
  const rawRole = messageDoc ? asString(messageDoc.role) : null;

  if (task?.state === "input-required" || task?.state === "auth-required") {
    return {
      kind: "waiting",
      waitingFor: task.state === "input-required" ? "input" : "auth",
      text,
      rawRole,
      task,
    };
  }
  if (task?.state && FAILED_TASK_STATES.has(task.state)) {
    return { kind: "failure", code: null, message: text ?? "", rawRole, task };
  }
  return { kind: "success", text, rawRole, task };
}

/** Reads a failed test call: the `detail` the route returns, or a transport error. */
export function interpretTestFailure(
  err: unknown,
  { timedOut = false }: { timedOut?: boolean } = {},
): AgentTestFailure {
  const status =
    err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;
  const body = err && typeof err === "object" ? (err as { body?: unknown }).body : undefined;
  const detail = isRecord(body) ? body.detail : undefined;

  let errorType: string | null = null;
  let message: string | null = null;
  if (isRecord(detail)) {
    errorType = asString(detail.error_type);
    message = asString(detail.error) ?? asString(detail.message);
  } else if (typeof detail === "string") {
    message = asString(detail);
  } else if (Array.isArray(detail) && isRecord(detail[0])) {
    // The default FastAPI 422 for a body that fails validation.
    message = asString(detail[0].msg);
  }

  return {
    errorType,
    message,
    status,
    timedOut: timedOut || errorType === "timeout" || status === 504,
  };
}
