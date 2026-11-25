import { useEffect, useId, useState } from "react";
import { useIntl } from "react-intl";
import { ArrowUp, CircleStop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AGENT_TEST_QUERY_MAX_LENGTH, AGENT_TEST_TIMEOUT_MS } from "@/config/agentTest";
import { useAgentTest } from "@/hooks/useAgentTest";
import { AgentTestResult, STATUS_ROW } from "./AgentTestResult";

interface AgentTryItTabProps {
  agentId: string;
  protocolVersion?: string | null;
}

function formatTicking(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Counts up while a call is in flight. */
function useElapsedWhile(active: boolean): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const startedAt = performance.now();
    setMs(0);
    const timer = setInterval(() => setMs(Math.round(performance.now() - startedAt)), 100);
    return () => clearInterval(timer);
  }, [active]);
  return ms;
}

/**
 * Sends one test message to an agent. The service picks the request body from
 * the agent's type, so there is no message builder and no JSON editor here;
 * leaving the field empty sends its default and works as a connectivity check.
 */
export function AgentTryItTab({ agentId, protocolVersion }: AgentTryItTabProps) {
  const intl = useIntl();
  const fieldId = useId();
  const hintId = useId();
  const counterId = useId();
  const [query, setQuery] = useState("");
  const test = useAgentTest(agentId);
  const elapsed = useElapsedWhile(test.isLoading);
  const hasResult = test.outcome !== null || test.failure !== null;

  // One slot under the field, in this order of precedence.
  const slot = test.isLoading
    ? "running"
    : hasResult
      ? "result"
      : query.length > 0
        ? "counter"
        : "hint";

  const [sendStartedRun, setSendStartedRun] = useState(false);

  const send = (fromSend: boolean) => {
    if (test.isLoading) return;
    setSendStartedRun(fromSend);
    void test.run(query);
  };

  return (
    <div className="space-y-3">
      <label htmlFor={fieldId} className="block text-sm leading-5 font-medium text-foreground">
        {intl.formatMessage({ id: "agents.try.title" })}
      </label>
      <form
        className="flex flex-col gap-2 rounded-xl border border-input p-2 focus-within:ring-2 focus-within:ring-ring"
        onSubmit={(event) => {
          event.preventDefault();
          send(true);
        }}
      >
        <textarea
          id={fieldId}
          value={query}
          maxLength={AGENT_TEST_QUERY_MAX_LENGTH}
          rows={2}
          aria-describedby={slot === "hint" ? hintId : slot === "counter" ? counterId : undefined}
          placeholder={intl.formatMessage({ id: "agents.try.placeholder" })}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, as in a chat box; Shift+Enter starts a new line.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send(true);
            }
          }}
          className="min-h-10 w-full resize-none bg-transparent px-2 py-1 text-sm leading-5 text-foreground outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="icon-xs"
            className={cn("rounded-sm", !sendStartedRun && "disabled:opacity-100")}
            disabled={test.isLoading}
            aria-label={intl.formatMessage({ id: "agents.try.send" })}
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </form>

      {slot === "hint" && (
        <p id={hintId} className="text-[13px] leading-4 text-muted-foreground">
          {intl.formatMessage({ id: "agents.try.notice" })}
        </p>
      )}

      {slot === "counter" && (
        <p id={counterId} className="text-right text-xs leading-4 text-muted-foreground">
          {intl.formatMessage(
            { id: "agents.try.counter" },
            { count: query.length, max: AGENT_TEST_QUERY_MAX_LENGTH },
          )}
        </p>
      )}

      {slot === "running" ? (
        <div role="status" className={`${STATUS_ROW} gap-3 text-[13px] leading-4`}>
          <span className="grid font-medium text-muted-foreground tabular-nums">
            <span aria-hidden="true" className="invisible col-start-1 row-start-1">
              {intl.formatMessage(
                { id: "agents.try.elapsed" },
                { time: formatTicking(AGENT_TEST_TIMEOUT_MS) },
              )}
            </span>
            <span className="col-start-1 row-start-1">
              {intl.formatMessage({ id: "agents.try.elapsed" }, { time: formatTicking(elapsed) })}
            </span>
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={test.stopWaiting}>
            <CircleStop aria-hidden="true" />
            {intl.formatMessage({ id: "agents.try.cancel" })}
          </Button>
        </div>
      ) : (
        <AgentTestResult
          state={test}
          protocolVersion={protocolVersion}
          onRetest={() => send(false)}
        />
      )}
    </div>
  );
}
