import type { ReactNode } from "react";
import { useIntl } from "react-intl";
import { Circle, CircleCheck, Info, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentTestState } from "@/hooks/useAgentTest";
import type { AgentTestTask } from "./agentTestOutcome";

const KNOWN_ERROR_TYPES = [
  "not_found",
  "agent_error",
  "agent_disabled",
  "validation_error",
  "internal_error",
  "timeout",
] as const;

interface AgentTestResultProps {
  state: Pick<AgentTestState, "outcome" | "failure" | "elapsedMs">;
  /** The agent's A2A version, shown with the reply so a reader knows how it was read. */
  protocolVersion?: string | null;
  /** Sends the same message again. */
  onRetest: () => void;
}

/** Shared with the in-flight row to avoid content shift. */
export const STATUS_ROW = "flex min-h-8 items-center";

/** "38 ms" under a second, "1.42s" above. */
export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)}s`;
}

function Dot() {
  return <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-muted-foreground" />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-20 shrink-0 text-xs leading-4 font-semibold text-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-words text-[13px] leading-4 text-secondary-foreground">
        {children}
      </dd>
    </div>
  );
}

/** Pieces joined by the design's dot separator. */
function Dotted({ parts }: { parts: Array<string | null | undefined> }) {
  const shown = parts.filter((part): part is string => Boolean(part));
  return (
    <>
      {shown.map((part, index) => (
        <span key={`${part}-${index}`} className="flex items-center gap-2">
          {index > 0 && <Dot />}
          <span className="break-all">{part}</span>
        </span>
      ))}
    </>
  );
}

/**
 * What a test call came back with, as one status line and a box of rows. A reply
 * that carries an error, a timeout, and an agent waiting on the caller each get
 * their own wording, so none of them reads as a plain success or a plain failure.
 * Text from the agent is shown as text, never as markup.
 */
export function AgentTestResult({ state, protocolVersion, onRetest }: AgentTestResultProps) {
  const intl = useIntl();
  const { outcome, failure, elapsedMs } = state;
  if (!outcome && !failure) return null;

  const t = (id: string, values?: Record<string, string | number>) =>
    intl.formatMessage({ id }, values);

  let status: number | null = 200;
  let tone: "ok" | "failed" | "waiting" | "timeout" = "ok";
  let label = t("agents.try.status.ok");
  let message: string | null = null;
  let errorType: string | null = null;
  let httpNote: string | null = null;
  let task: AgentTestTask | null = null;
  let rawRole: string | null = null;
  let note: string | null = null;

  if (failure) {
    status = failure.status;
    if (failure.timedOut) {
      tone = "timeout";
      label = t("agents.try.status.timedOut");
      message = t("agents.try.timeout.message");
      if (elapsedMs !== null) {
        note = t("agents.try.noResponse", { seconds: Math.round(elapsedMs / 1000) });
      }
    } else {
      tone = "failed";
      label = t("agents.try.status.failed");
      message = failure.message ?? t("agents.try.failure.generic");
    }
    if (failure.errorType) {
      errorType = (KNOWN_ERROR_TYPES as readonly string[]).includes(failure.errorType)
        ? t(`agents.try.errorType.${failure.errorType}`)
        : failure.errorType;
    }
  } else if (outcome?.kind === "failure") {
    tone = "failed";
    label = t("agents.try.status.failed");
    message =
      outcome.code !== null
        ? t("agents.try.rpcError.detail", { code: String(outcome.code), message: outcome.message })
        : outcome.message || t("agents.try.failure.generic");
    httpNote = t("agents.try.rpcError.note");
    task = outcome.task;
    rawRole = outcome.rawRole;
  } else if (outcome?.kind === "waiting") {
    tone = "waiting";
    label = t("agents.try.status.waiting");
    message =
      outcome.text ??
      t(outcome.waitingFor === "input" ? "agents.try.waiting.input" : "agents.try.waiting.auth");
    httpNote = t("agents.try.waiting.note");
    task = outcome.task;
    rawRole = outcome.rawRole;
  } else if (outcome?.kind === "empty") {
    message = t("agents.try.empty");
  } else if (outcome?.kind === "success") {
    message = outcome.text ?? t("agents.try.success.noText");
    task = outcome.task;
    rawRole = outcome.rawRole;
  }

  const protocol = protocolVersion
    ? intl.formatMessage({ id: "agents.details.protocol" }, { version: protocolVersion })
    : null;
  const hasProtocolRow = Boolean(protocol || task?.rawState || rawRole);
  const statusText = [status, label].filter((part) => part !== null).join(" ");

  const StatusIcon =
    tone === "ok" ? CircleCheck : tone === "timeout" ? Timer : tone === "waiting" ? Info : Circle;
  const iconTone =
    tone === "ok"
      ? "text-success"
      : tone === "failed"
        ? "text-destructive"
        : tone === "waiting"
          ? "text-warning"
          : "text-foreground";

  return (
    <div aria-live="polite" className="space-y-2">
      <div className={`${STATUS_ROW} gap-1`}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[13px] leading-4 font-medium">
          <span className="flex items-center gap-2 text-popover-foreground">
            <StatusIcon className={`size-3.5 shrink-0 ${iconTone}`} aria-hidden="true" />
            {statusText}
          </span>
          {(note ?? (elapsedMs !== null ? formatElapsed(elapsedMs) : null)) && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Dot />
              {note ?? formatElapsed(elapsedMs as number)}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="shadow-none"
          onClick={onRetest}
        >
          {t("agents.try.retest")}
        </Button>
      </div>

      <dl className="animate-in fade-in space-y-2 rounded-[6px] border border-input p-4 duration-200 motion-reduce:animate-none">
        <Row label={t("agents.try.row.agent")}>
          <span className="whitespace-pre-wrap break-words">{message}</span>
        </Row>
        {errorType && <Row label={t("agents.try.row.errorType")}>{errorType}</Row>}
        {httpNote && <Row label={t("agents.try.row.http")}>{httpNote}</Row>}
        {task && (
          <Row label={t("agents.try.row.task")}>
            <Dotted parts={[task.id, task.state]} />
          </Row>
        )}
        {hasProtocolRow && (
          <Row label={t("agents.try.row.protocol")}>
            <Dotted parts={[protocol, task?.rawState, rawRole]} />
          </Row>
        )}
      </dl>
    </div>
  );
}
