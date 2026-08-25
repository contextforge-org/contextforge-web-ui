import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useIntl } from "react-intl";

import type { ToolInvokeState } from "@/hooks/useToolInvoke";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { ToolResultRenderer } from "./ToolResultRenderer";
import {
  estimateJsonByteSize,
  formatToolResultBytes,
  getToolResultIsError,
  TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES,
} from "./toolResultContent";

export interface ToolLiveInvokeResultProps {
  invoke: Pick<ToolInvokeState, "result" | "error" | "hasRun">;
}

export function ToolLiveInvokeResult({ invoke }: ToolLiveInvokeResultProps) {
  const intl = useIntl();
  const { result, error, hasRun } = invoke;

  if (!hasRun) return null;

  const renderTimeMs = result?.renderTimeMs ?? error?.renderTimeMs ?? 0;
  const response = result?.result;
  const toolResultIsError = response ? getToolResultIsError(response) : false;
  const succeeded = result !== null;
  const statusOk = succeeded && !toolResultIsError;
  const statusLabel = succeeded
    ? intl.formatMessage({ id: "tools.details.invoke.statusOk" }, { status: result.status })
    : error?.code !== undefined
      ? intl.formatMessage({ id: "tools.details.invoke.statusErrorWithCode" }, { code: error.code })
      : error?.status !== null && error?.status !== undefined
        ? intl.formatMessage(
            { id: "tools.details.invoke.statusErrorWithStatus" },
            { status: error.status },
          )
        : intl.formatMessage({ id: "tools.details.invoke.statusError" });

  return (
    <section className="space-y-4">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"
      >
        {statusOk ? (
          <CheckCircle2 className="size-4 text-tool-status-active" />
        ) : (
          <AlertCircle className="size-4 text-destructive" />
        )}
        <span className={cn("font-medium", statusOk ? "text-foreground" : "text-destructive")}>
          {statusLabel}
        </span>
        <span className="text-muted-foreground" aria-hidden="true">
          -
        </span>
        <span className="text-muted-foreground">
          {intl.formatMessage({ id: "tools.details.preview.renderMs" }, { ms: renderTimeMs })}
        </span>
      </div>

      {response && <ToolResultRenderer response={response} />}

      {response && (
        <Accordion type="single" collapsible className="rounded-md border border-border">
          <AccordionItem value="raw-live-response" className="border-b-0 px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              {intl.formatMessage({ id: "tools.details.invoke.rawResponse" })}
            </AccordionTrigger>
            <AccordionContent>
              <RawLiveResponse response={response} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {error && (
        <pre className="overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-4 font-mono text-[12px] leading-relaxed text-destructive">
          {error.message}
        </pre>
      )}
    </section>
  );
}

function RawLiveResponse({ response }: { response: unknown }) {
  const intl = useIntl();
  const byteSize = estimateJsonByteSize(
    response,
    TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES + 1,
  );
  const isLarge = byteSize > TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES;
  const [expanded, setExpanded] = useState(!isLarge);
  const sizeLabel = isLarge
    ? `>${formatToolResultBytes(TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES)}`
    : formatToolResultBytes(byteSize);

  if (isLarge && !expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-[13px]">
        <span className="text-muted-foreground">
          {intl.formatMessage(
            { id: "tools.details.preview.result.largeContent" },
            { size: sizeLabel },
          )}
        </span>
        <Button type="button" variant="outline" size="xs" onClick={() => setExpanded(true)}>
          {intl.formatMessage({ id: "tools.details.preview.result.viewAll" })}
        </Button>
      </div>
    );
  }

  return (
    <CodeBlock
      code={JSON.stringify(response, null, 2)}
      language="json"
      copyLabel={intl.formatMessage({ id: "tools.details.invoke.copyRawResponse" })}
    />
  );
}
