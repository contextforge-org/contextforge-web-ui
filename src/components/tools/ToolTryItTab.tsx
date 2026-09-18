import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ComponentProps, Ref } from "react";
import { useIntl } from "react-intl";
import { TriangleAlert, Wrench } from "lucide-react";

import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CodeBlock } from "@/components/ui/code-block";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Tool } from "@/types/tool";
import { useToolInvoke } from "@/hooks/useToolInvoke";
import { useToolPreview } from "@/hooks/useToolPreview";
import {
  TOOL_SNIPPET_MCP_VERSION,
  TOOL_PREVIEW_SNIPPETS,
  TOOL_SNIPPETS,
  type ToolSnippetLanguage,
} from "./buildToolSnippets";
import { ToolArgumentsForm, seedToolArguments } from "./ToolArgumentsForm";
import { getForwardableHeaders, type ToolHeaderRow, ToolHeadersEditor } from "./ToolHeadersEditor";
import {
  getToolLiveInvokeAvailabilityMessage,
  resolveToolLiveInvokeAvailability,
  ToolLiveInvokeGate,
} from "./ToolLiveInvokeGate";
import { ToolLiveInvokeResult } from "./ToolLiveInvokeResult";
import { ToolPreviewButton } from "./ToolPreviewButton";
import { ToolPreviewResult } from "./ToolPreviewResult";
import { getToolAnnotationHints } from "./toolAnnotations";

const DEFAULT_SNIPPET_LANGUAGE: ToolSnippetLanguage = "curl";

export interface ToolTryItTabProps {
  headingRef?: Ref<HTMLHeadingElement>;
  invalidGatewayId?: boolean;
  onClear?: () => void;
  resultContext?: ComponentProps<typeof ToolLiveInvokeResult>["context"];
  serverScope?: { serverId: string; serverName: string };
  tools?: Tool[];
  selectedTool: Tool;
  onSelectTool?: (tool: Tool) => void;
}

export function ToolTryItTab({
  headingRef,
  invalidGatewayId = false,
  onClear,
  resultContext,
  serverScope,
  tools,
  selectedTool,
  onSelectTool,
}: ToolTryItTabProps) {
  const intl = useIntl();
  const liveModeDescriptionId = useId();
  const liveModeReasonId = useId();
  const { hasPermission, permissionsLoading } = useAuth();
  const [args, setArgs] = useState<Record<string, unknown>>(() =>
    seedToolArguments(selectedTool.inputSchema),
  );
  const [headers, setHeaders] = useState<ToolHeaderRow[]>([]);
  const [argsValid, setArgsValid] = useState(true);
  const [headersValid, setHeadersValid] = useState(true);
  const [snippetLanguage, setSnippetLanguage] =
    useState<ToolSnippetLanguage>(DEFAULT_SNIPPET_LANGUAGE);
  const [liveMode, setLiveMode] = useState(false);
  const scopedMode = Boolean(serverScope);
  const forwardableHeaders = useMemo(() => getForwardableHeaders(headers), [headers]);
  const annotationHints = getToolAnnotationHints(selectedTool.annotations);
  const liveAvailability = useMemo(
    () =>
      resolveToolLiveInvokeAvailability({
        canExecute: hasPermission("tools.execute"),
        canUseServers: hasPermission("servers.use"),
        permissionsLoading,
        invalidGatewayId,
        tool: selectedTool,
      }),
    [hasPermission, permissionsLoading, invalidGatewayId, selectedTool],
  );
  const liveModeAvailable =
    liveAvailability.state === "available" || liveAvailability.state === "requiresConfirmation";
  const preview = useToolPreview(selectedTool.name, args, forwardableHeaders, {
    enabled: !scopedMode || !liveMode,
    serverId: serverScope?.serverId,
  });
  const invoke = useToolInvoke(selectedTool.name, args, forwardableHeaders, {
    serverId: serverScope?.serverId,
  });
  const resetPreview = preview.reset;
  const resetInvoke = invoke.reset;
  const previousToolIdRef = useRef(selectedTool.id);
  const availableTools = tools ?? [selectedTool];
  const selectedToolLabel =
    selectedTool.displayName ||
    selectedTool.title ||
    selectedTool.originalName ||
    selectedTool.name;
  const snippetSpecs = scopedMode && !liveMode ? TOOL_PREVIEW_SNIPPETS : TOOL_SNIPPETS;
  const snippets = useMemo(
    () =>
      snippetSpecs.map((spec) => ({
        ...spec,
        text: spec.build({ toolName: selectedTool.name, args, serverId: serverScope?.serverId }),
      })),
    [args, serverScope?.serverId, selectedTool.name, snippetSpecs],
  );

  useEffect(() => {
    if (previousToolIdRef.current === selectedTool.id) return;
    previousToolIdRef.current = selectedTool.id;
    setArgs(seedToolArguments(selectedTool.inputSchema));
    setHeaders([]);
    setArgsValid(true);
    setHeadersValid(true);
    setLiveMode(false);
    setSnippetLanguage(DEFAULT_SNIPPET_LANGUAGE);
    resetPreview();
    resetInvoke();
  }, [resetInvoke, resetPreview, selectedTool]);

  useEffect(() => {
    if (!scopedMode || liveModeAvailable) return;
    setLiveMode(false);
  }, [liveModeAvailable, scopedMode]);

  const handleLiveModeChange = (checked: boolean) => {
    setLiveMode(checked);
    setSnippetLanguage(DEFAULT_SNIPPET_LANGUAGE);
    resetPreview();
    resetInvoke();
  };

  return (
    <div className="space-y-6">
      {scopedMode ? (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <h3 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-foreground">
              {intl.formatMessage({ id: "tools.details.test.title" })}
            </h3>
            {onClear && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label={intl.formatMessage({ id: "tools.details.test.clearAccessible" })}
                onClick={onClear}
              >
                {intl.formatMessage({ id: "tools.details.test.clear" })}
              </Button>
            )}
          </div>
          <Badge
            variant="draft"
            className="inline-flex max-w-full items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs text-muted-foreground"
          >
            <Wrench className="size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate" title={selectedToolLabel}>
              {selectedToolLabel}
            </span>
          </Badge>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 ref={headingRef} className="text-sm font-semibold text-foreground">
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

          {availableTools.length > 1 && onSelectTool && (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={intl.formatMessage({ id: "tools.details.preview.selectTool" })}
            >
              {availableTools.map((tool) => {
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
      )}

      {scopedMode && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-4 border-y border-border py-3">
            <div className="space-y-1">
              <Label
                htmlFor={`tool-live-mode-${selectedTool.id}`}
                className="text-sm font-medium text-foreground"
              >
                {intl.formatMessage({ id: "tools.details.test.liveMode" })}
              </Label>
              <p
                id={liveModeDescriptionId}
                className="max-w-md text-[12px] leading-4 text-muted-foreground"
              >
                {intl.formatMessage({ id: "tools.details.test.liveModeDescription" })}
              </p>
              {!liveModeAvailable && (
                <p
                  id={liveModeReasonId}
                  className="max-w-md text-[12px] leading-4 text-muted-foreground"
                >
                  {getToolLiveInvokeAvailabilityMessage(liveAvailability, intl.formatMessage)}
                </p>
              )}
            </div>
            <Switch
              id={`tool-live-mode-${selectedTool.id}`}
              aria-describedby={`${liveModeDescriptionId}${liveModeAvailable ? "" : ` ${liveModeReasonId}`}`}
              checked={liveMode}
              disabled={!liveModeAvailable}
              onCheckedChange={handleLiveModeChange}
            />
          </div>
          {liveMode && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-sm bg-muted px-3 py-2 text-[12px] leading-4 text-muted-foreground"
            >
              <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <span>{intl.formatMessage({ id: "tools.details.test.liveModeWarning" })}</span>
            </div>
          )}
        </div>
      )}

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
                {snippetSpecs.map((spec) => (
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
              {(!scopedMode || !liveMode) && (
                <ToolPreviewButton preview={preview} disabled={!argsValid || !headersValid} />
              )}
              {(!scopedMode || liveMode) && (
                <ToolLiveInvokeGate
                  tool={selectedTool}
                  invalidGatewayId={invalidGatewayId}
                  invoke={invoke}
                  disabled={!argsValid || !headersValid}
                />
              )}
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

      {(!scopedMode || !liveMode) && <ToolPreviewResult preview={preview} />}
      {(!scopedMode || liveMode) && (
        <ToolLiveInvokeResult invoke={invoke} context={resultContext} />
      )}
    </div>
  );
}
