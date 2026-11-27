import { useEffect, useId, useState } from "react";
import { useIntl } from "react-intl";
import { ArrowUp, CircleStop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_TEST_QUERY_MAX_LENGTH } from "@/config/agentTest";
import { useAgentTest } from "@/hooks/useAgentTest";
import { AgentTestResult, formatElapsed } from "./AgentTestResult";

interface AgentTryItTabProps {
  agentId: string;
  protocolVersion?: string | null;
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
  const [query, setQuery] = useState("");
  const test = useAgentTest(agentId);
  const elapsed = useElapsedWhile(test.isLoading);
  const hasResult = test.outcome !== null || test.failure !== null;

  const send = () => {
    if (!test.isLoading) void test.run(query);
  };

  return (
    <div>
      <div className="space-y-3">
        <Label htmlFor={fieldId} className="block text-foreground">
          {intl.formatMessage({ id: "agents.try.title" })}
        </Label>
        <form
          className="flex flex-col gap-2 rounded-xl border border-input p-2 focus-within:ring-2 focus-within:ring-ring"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <Textarea
            id={fieldId}
            value={query}
            maxLength={AGENT_TEST_QUERY_MAX_LENGTH}
            rows={2}
            aria-describedby={hasResult || test.isLoading ? undefined : hintId}
            placeholder={intl.formatMessage({ id: "agents.try.placeholder" })}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, as in a chat box; Shift+Enter starts a new line.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            className="min-h-10 resize-none rounded-none border-0 px-2 py-1 leading-5 text-foreground shadow-none [field-sizing:fixed] placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="icon-xs"
              className="rounded-sm"
              disabled={test.isLoading}
              aria-label={intl.formatMessage({ id: "agents.try.send" })}
            >
              <ArrowUp className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </form>

        {test.isLoading ? (
          <div className="flex items-center gap-3 text-[13px] leading-4">
            {/* A timer is not announced as it ticks, unlike a status region. */}
            <span role="timer" className="font-medium text-muted-foreground">
              {intl.formatMessage({ id: "agents.try.elapsed" }, { time: formatElapsed(elapsed) })}
            </span>
            <Button type="button" variant="ghost" size="xs" onClick={test.stopWaiting}>
              <CircleStop aria-hidden="true" />
              {intl.formatMessage({ id: "agents.try.cancel" })}
            </Button>
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {intl.formatMessage(
                { id: "agents.try.counter" },
                { count: query.length, max: AGENT_TEST_QUERY_MAX_LENGTH },
              )}
            </span>
          </div>
        ) : (
          !hasResult && (
            <p id={hintId} className="text-[13px] leading-4 text-muted-foreground">
              {intl.formatMessage({ id: "agents.try.notice" })}
            </p>
          )
        )}
      </div>

      {/* Mounted before the result arrives, or a screen reader would not announce it. */}
      <div aria-live="polite" className="mt-6 empty:mt-0">
        {!test.isLoading && (
          <AgentTestResult state={test} protocolVersion={protocolVersion} onRetest={send} />
        )}
      </div>
    </div>
  );
}
