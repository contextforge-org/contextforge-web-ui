import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ComponentProps, Ref } from "react";
import { useIntl } from "react-intl";
import { Info, Tag, TriangleAlert, Wrench } from "lucide-react";

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
  getToolLiveInvokeToggleVisibility,
  resolveToolLiveInvokeAvailability,
  ToolLiveInvokeGate,
} from "./ToolLiveInvokeGate";
import { ToolLiveInvokeResult } from "./ToolLiveInvokeResult";
import { ToolPreviewButton } from "./ToolPreviewButton";
import { ToolPreviewResult } from "./ToolPreviewResult";
import { LiveInvokeInfoPopover } from "./LiveInvokeInfoPopover";
import { TruncatedDescription } from "./TruncatedDescription";

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
  const toolDescriptionId = useId();
  const { hasPermission, permissionsLoading, permissionsError } = useAuth();
  const [args, setArgs] = useState<Record<string, unknown>>(() =>
    seedToolArguments(selectedTool.inputSchema),
  );
  const [headers, setHeaders] = useState<ToolHeaderRow[]>([]);
  const [argsValid, setArgsValid] = useState(true);
  const [argsValidationAttempted, setArgsValidationAttempted] = useState(false);
  const [headersValid, setHeadersValid] = useState(true);
  const [snippetLanguage, setSnippetLanguage] =
    useState<ToolSnippetLanguage>(DEFAULT_SNIPPET_LANGUAGE);
  const [liveMode, setLiveMode] = useState(false);
  const scopedMode = Boolean(serverScope);
  const forwardableHeaders = useMemo(() => getForwardableHeaders(headers), [headers]);
  const liveAvailability = useMemo(
    () =>
      resolveToolLiveInvokeAvailability({
        canExecute: hasPermission("tools.execute"),
        canUseServers: hasPermission("servers.use"),
        permissionsLoading,
        permissionsError,
        invalidGatewayId,
        tool: selectedTool,
      }),
    [hasPermission, permissionsLoading, permissionsError, invalidGatewayId, selectedTool],
  );
  const liveModeToggleVisibility = getToolLiveInvokeToggleVisibility(liveAvailability);
  const liveModeAvailable = liveModeToggleVisibility === "enabled";
  const preview = useToolPreview(selectedTool.name, args, forwardableHeaders, {
    enabled: !liveMode,
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
  const snippetSpecs = !liveMode ? TOOL_PREVIEW_SNIPPETS : TOOL_SNIPPETS;
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
    setArgsValidationAttempted(false);
    setHeadersValid(true);
    setLiveMode(false);
    setSnippetLanguage(DEFAULT_SNIPPET_LANGUAGE);
    resetPreview();
    resetInvoke();
  }, [resetInvoke, resetPreview, selectedTool]);

  useEffect(() => {
    if (liveModeAvailable) return;
    setLiveMode(false);
  }, [liveModeAvailable]);

  // Only curl, Python and TypeScript are offered by both snippet lists (the
  // preview list has JSON, the live list has JSON-RPC); fall back to the
  // default tab whenever the active one isn't in the current list, whether
  // that's from the toggle below or from live mode being turned off
  // automatically (e.g. once permissions resolve).
  useEffect(() => {
    if (snippetSpecs.some((spec) => spec.value === snippetLanguage)) return;
    setSnippetLanguage(DEFAULT_SNIPPET_LANGUAGE);
  }, [snippetSpecs, snippetLanguage]);

  const handleLiveModeChange = (checked: boolean) => {
    setLiveMode(checked);
    resetPreview();
    resetInvoke();
  };

  const validateArgumentsForRun = () => {
    setArgsValidationAttempted(true);
    return argsValid && headersValid;
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
            variant="secondary"
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
          <h3 ref={headingRef} className="text-sm font-semibold text-foreground">
            {intl.formatMessage({ id: "tools.details.picker.title" })}
          </h3>

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

          <div className="flex max-w-4xl flex-wrap items-baseline gap-x-2 gap-y-1 whitespace-normal break-words text-[13px] leading-4 text-muted-foreground">
            <span className="inline-flex shrink-0 items-center gap-1.5 font-medium">
              <Tag className="size-3" aria-hidden="true" />
              {intl.formatMessage(
                { id: "tools.details.code.mcpVersionLabel" },
                { version: TOOL_SNIPPET_MCP_VERSION },
              )}
            </span>
            {selectedTool.description && (
              <TruncatedDescription
                text={selectedTool.description}
                id={toolDescriptionId}
                className="min-w-0 flex-1"
              />
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {liveModeToggleVisibility !== "hidden" && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor={`tool-live-mode-${selectedTool.id}`}
                className="text-sm font-medium text-foreground"
              >
                {intl.formatMessage({ id: "tools.details.test.liveMode" })}
              </Label>
              <LiveInvokeInfoPopover mode={liveMode ? "live" : "preview"} />
            </div>
            <div className="flex items-start gap-3">
              <Switch
                id={`tool-live-mode-${selectedTool.id}`}
                className="shrink-0"
                aria-describedby={`${liveModeDescriptionId}${liveModeAvailable ? "" : ` ${liveModeReasonId}`}`}
                checked={liveMode}
                disabled={liveModeToggleVisibility === "disabled"}
                onCheckedChange={handleLiveModeChange}
              />
              <p
                id={liveModeDescriptionId}
                className={cn(
                  "max-w-md text-[12px] leading-4",
                  liveMode ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {intl.formatMessage({ id: "tools.details.test.liveModeDescription" })}
              </p>
            </div>
            {liveModeToggleVisibility === "disabled" && (
              <div
                id={liveModeReasonId}
                role="status"
                className="flex min-h-12 items-center gap-2 rounded-sm bg-muted px-3 py-3 text-[12px] leading-4 text-muted-foreground"
              >
                <Info className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  {getToolLiveInvokeAvailabilityMessage(liveAvailability, intl.formatMessage)}
                </span>
              </div>
            )}
          </div>
        )}
        {liveMode && (
          <div
            role="status"
            className="flex min-h-12 items-center gap-2 rounded-sm bg-muted px-3 py-3 text-[12px] leading-4 text-muted-foreground"
          >
            <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{intl.formatMessage({ id: "tools.details.test.liveModeWarning" })}</span>
          </div>
        )}
      </div>

      <ToolArgumentsForm
        key={`args-${selectedTool.id}`}
        schema={selectedTool.inputSchema}
        value={args}
        onChange={setArgs}
        onValidityChange={setArgsValid}
        validationAttempted={argsValidationAttempted}
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
              {scopedMode && (
                <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
                  {intl.formatMessage(
                    { id: "tools.details.code.mcpVersionBadge" },
                    { version: TOOL_SNIPPET_MCP_VERSION },
                  )}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-start justify-end gap-2">
              {!liveMode ? (
                <ToolPreviewButton
                  preview={preview}
                  disabled={!headersValid}
                  onBeforeRun={validateArgumentsForRun}
                />
              ) : (
                <ToolLiveInvokeGate
                  tool={selectedTool}
                  invalidGatewayId={invalidGatewayId}
                  invoke={invoke}
                  disabled={!headersValid}
                  onBeforeRun={validateArgumentsForRun}
                  presentation="tool"
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

      {!liveMode ? (
        <ToolPreviewResult preview={preview} />
      ) : (
        <ToolLiveInvokeResult invoke={invoke} context={resultContext} />
      )}
    </div>
  );
}
