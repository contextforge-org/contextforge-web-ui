import { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tool } from "@/types/tool";
import { useToolPreview } from "@/hooks/useToolPreview";
import { ToolArgumentsForm, seedToolArguments } from "./ToolArgumentsForm";
import { getForwardableHeaders, type ToolHeaderRow, ToolHeadersEditor } from "./ToolHeadersEditor";
import { ToolPreviewButton } from "./ToolPreviewButton";
import { ToolPreviewResult } from "./ToolPreviewResult";
import { getToolAnnotationHints } from "./toolAnnotations";

export interface ToolTryItTabProps {
  tools: Tool[];
  selectedTool: Tool;
  onSelectTool: (tool: Tool) => void;
}

export function ToolTryItTab({ tools, selectedTool, onSelectTool }: ToolTryItTabProps) {
  const intl = useIntl();
  const [args, setArgs] = useState<Record<string, unknown>>(() =>
    seedToolArguments(selectedTool.inputSchema),
  );
  const [headers, setHeaders] = useState<ToolHeaderRow[]>([]);
  const [argsValid, setArgsValid] = useState(true);
  const [headersValid, setHeadersValid] = useState(true);
  const forwardableHeaders = useMemo(() => getForwardableHeaders(headers), [headers]);
  const annotationHints = getToolAnnotationHints(selectedTool.annotations);
  const preview = useToolPreview(selectedTool.name, args, forwardableHeaders);
  const resetPreview = preview.reset;

  useEffect(() => {
    setArgs(seedToolArguments(selectedTool.inputSchema));
    setHeaders([]);
    setArgsValid(true);
    setHeadersValid(true);
    resetPreview();
  }, [resetPreview, selectedTool.id, selectedTool.inputSchema]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {intl.formatMessage({ id: "tools.details.preview.title" })}
          </h3>
          {annotationHints.readOnlyHint && (
            <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
              {intl.formatMessage({ id: "tools.details.preview.annotation.readOnly" })}
            </Badge>
          )}
          {annotationHints.destructiveHint && (
            <Badge variant="destructive" className="rounded-full px-2 py-0 text-[11px]">
              {intl.formatMessage({ id: "tools.details.preview.annotation.destructive" })}
            </Badge>
          )}
        </div>

        {tools.length > 1 && (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={intl.formatMessage({ id: "tools.details.preview.selectTool" })}
          >
            {tools.map((tool) => {
              const isSelected = tool.id === selectedTool.id;
              return (
                <Button
                  key={tool.id}
                  type="button"
                  variant={isSelected ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={isSelected}
                  onClick={() => onSelectTool(tool)}
                  className={cn(
                    "rounded-full font-mono text-[12px]",
                    isSelected
                      ? "border-transparent bg-muted text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {tool.name}
                </Button>
              );
            })}
          </div>
        )}

        {selectedTool.description && (
          <p className="max-w-4xl whitespace-normal break-words text-[13px] leading-5 text-muted-foreground">
            {selectedTool.description}
          </p>
        )}
      </div>

      <ToolArgumentsForm
        key={`args-${selectedTool.id}`}
        schema={selectedTool.inputSchema}
        value={args}
        onChange={setArgs}
        onValidityChange={setArgsValid}
      />

      <ToolHeadersEditor rows={headers} onChange={setHeaders} onValidityChange={setHeadersValid} />

      <div className="flex items-center justify-end">
        <ToolPreviewButton preview={preview} disabled={!argsValid || !headersValid} />
      </div>

      <ToolPreviewResult preview={preview} />
    </div>
  );
}
