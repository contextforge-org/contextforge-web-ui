import { useState } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { ToolPreviewState } from "@/hooks/useToolPreview";
import type { ToolPreviewResponse, ToolPreviewTarget, ToolPreviewWarning } from "@/api/tools";
import { ToolResultRenderer } from "./ToolResultRenderer";
import {
  estimateJsonByteSize,
  formatToolResultBytes,
  getToolResultIsError,
  TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES,
} from "./toolResultContent";

export interface ToolPreviewResultProps {
  preview: Pick<ToolPreviewState, "result" | "error" | "hasRun">;
}

export function ToolPreviewResult({ preview }: ToolPreviewResultProps) {
  const intl = useIntl();
  const { result, error, hasRun } = preview;

  if (!hasRun) return null;

  const renderTimeMs = result?.renderTimeMs ?? error?.renderTimeMs ?? 0;
  const response = result?.preview;
  const resolvedArguments = response?.resolved_arguments ?? response?.resolvedArguments;
  const toolResultIsError = response ? getToolResultIsError(response) : false;
  const succeeded = result !== null;
  const statusOk = succeeded && !toolResultIsError;
  const statusCode = result?.status ?? error?.status ?? null;
  const statusLabel = succeeded
    ? intl.formatMessage({ id: "tools.details.preview.statusOk" }, { status: statusCode ?? 200 })
    : statusCode !== null
      ? intl.formatMessage(
          { id: "tools.details.preview.statusErrorWithCode" },
          { status: statusCode },
        )
      : intl.formatMessage({ id: "tools.details.preview.statusError" });

  const target = response ? formatTarget(response.target) : null;
  const warnings = response?.warnings ?? [];

  return (
    <div className="space-y-4">
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
        {target && (
          <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
            {target}
          </Badge>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Info className="size-4 text-muted-foreground" />
            {intl.formatMessage({ id: "tools.details.preview.warnings.title" })}
          </div>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {warnings.map((warning, index) => (
              <li key={`${warning.code ?? "warning"}-${index}`}>
                {formatWarning(warning, intl.formatMessage)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {response && <ToolResultRenderer response={response} />}

      {resolvedArguments && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            {intl.formatMessage({ id: "tools.details.preview.resolvedArguments" })}
          </h4>
          <CodeBlock
            code={JSON.stringify(resolvedArguments, null, 2)}
            language="json"
            copyLabel={intl.formatMessage({ id: "tools.details.preview.copyResolvedArguments" })}
          />
        </section>
      )}

      {response && (
        <Accordion
          type="single"
          collapsible
          defaultValue="raw-response"
          className="rounded-md border border-border"
        >
          <AccordionItem value="raw-response" className="border-b-0 px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              {intl.formatMessage({ id: "tools.details.preview.rawResponse" })}
            </AccordionTrigger>
            <AccordionContent>
              <RawPreviewResponse response={response} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {error && (
        <pre className="overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-4 font-mono text-[12px] leading-relaxed text-destructive">
          {error.message}
        </pre>
      )}
    </div>
  );
}

function RawPreviewResponse({ response }: { response: ToolPreviewResponse }) {
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
      copyLabel={intl.formatMessage({ id: "tools.details.preview.copyRawResponse" })}
    />
  );
}

function formatWarning(
  warning: ToolPreviewWarning,
  formatMessage: (descriptor: { id: string }, values?: Record<string, string>) => string,
) {
  if (warning.code === "elicitation_skipped") {
    const hooks = formatWarningHooks(warning, formatMessage);
    return (
      warning.message ??
      formatMessage({ id: "tools.details.preview.warnings.elicitationSkipped" }, { hooks })
    );
  }

  return (
    warning.message ??
    warning.code ??
    formatMessage({ id: "tools.details.preview.warnings.generic" })
  );
}

function formatWarningHooks(
  warning: ToolPreviewWarning,
  formatMessage: (descriptor: { id: string }) => string,
) {
  const hooks = [
    typeof warning.hook === "string" ? warning.hook : null,
    ...(Array.isArray(warning.hooks) ? warning.hooks : []),
  ].filter((hook): hook is string => typeof hook === "string" && hook.length > 0);

  return hooks.length > 0
    ? hooks.join(", ")
    : formatMessage({ id: "tools.details.preview.warnings.unspecifiedHooks" });
}

function formatTarget(target: ToolPreviewTarget | "local" | "federated" | null | undefined) {
  if (!target) return null;
  if (typeof target === "string") return target;
  const kind = typeof target.kind === "string" ? target.kind : null;
  const gateway = target.gateway_name ?? target.gatewayName ?? target.name ?? null;
  return gateway ? `${kind ?? "target"}: ${gateway}` : kind;
}
