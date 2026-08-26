import { useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Tool } from "@/types/tool";
import { useToolInvoke } from "@/hooks/useToolInvoke";
import { useToolPreview } from "@/hooks/useToolPreview";
import {
  TOOL_SNIPPET_MCP_VERSION,
  TOOL_SNIPPETS,
  type ToolSnippetLanguage,
} from "./buildToolSnippets";
import { ToolArgumentsForm, seedToolArguments } from "./ToolArgumentsForm";
import { getForwardableHeaders, type ToolHeaderRow, ToolHeadersEditor } from "./ToolHeadersEditor";
import { ToolLiveInvokeGate } from "./ToolLiveInvokeGate";
import { ToolLiveInvokeResult } from "./ToolLiveInvokeResult";
import { ToolPreviewButton } from "./ToolPreviewButton";
import { ToolPreviewResult } from "./ToolPreviewResult";
import { getToolAnnotationHints } from "./toolAnnotations";

const DEFAULT_SNIPPET_LANGUAGE: ToolSnippetLanguage = "curl";

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
  const [snippetLanguage, setSnippetLanguage] =
    useState<ToolSnippetLanguage>(DEFAULT_SNIPPET_LANGUAGE);
  const forwardableHeaders = useMemo(() => getForwardableHeaders(headers), [headers]);
  const annotationHints = getToolAnnotationHints(selectedTool.annotations);
  const preview = useToolPreview(selectedTool.name, args, forwardableHeaders);
  const invoke = useToolInvoke(selectedTool.name, args, forwardableHeaders);
  const resetPreview = preview.reset;
  const resetInvoke = invoke.reset;
  const previousToolIdRef = useRef(selectedTool.id);
  const snippets = useMemo(
    () =>
      TOOL_SNIPPETS.map((spec) => ({
        ...spec,
        text: spec.build({ toolName: selectedTool.name, args }),
      })),
    [args, selectedTool.name],
  );

  useEffect(() => {
    if (previousToolIdRef.current === selectedTool.id) return;
    previousToolIdRef.current = selectedTool.id;
    setArgs(seedToolArguments(selectedTool.inputSchema));
    setHeaders([]);
    setArgsValid(true);
    setHeadersValid(true);
    resetPreview();
    resetInvoke();
  }, [resetInvoke, resetPreview, selectedTool]);

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

      <div className="space-y-4">
        <Tabs
          value={snippetLanguage}
          onValueChange={(value) => setSnippetLanguage(value as ToolSnippetLanguage)}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <TabsList>
                {TOOL_SNIPPETS.map((spec) => (
                  <TabsTrigger key={spec.value} value={spec.value}>
                    {intl.formatMessage({ id: spec.labelId })}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
                {intl.formatMessage(
                  { id: "tools.details.code.mcpVersionBadge" },
                  { version: TOOL_SNIPPET_MCP_VERSION },
                )}
              </Badge>
            </div>

            <div className="flex flex-wrap items-start justify-end gap-2">
              <ToolPreviewButton preview={preview} disabled={!argsValid || !headersValid} />
              <ToolLiveInvokeGate
                tool={selectedTool}
                invoke={invoke}
                disabled={!argsValid || !headersValid}
              />
            </div>
          </div>

          {snippets.map((snippet) => (
            <TabsContent key={snippet.value} value={snippet.value}>
              <CodeBlock
                code={snippet.text}
                language={snippet.prismLanguage}
                copyLabel={intl.formatMessage(
                  { id: "tools.details.code.copyAriaLabel" },
                  { language: snippet.language },
                )}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <ToolPreviewResult preview={preview} />
      <ToolLiveInvokeResult invoke={invoke} />
    </div>
  );
}
