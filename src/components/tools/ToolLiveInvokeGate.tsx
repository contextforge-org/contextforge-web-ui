import { useMemo, useState } from "react";
import { Loader2, Play, Square, Zap } from "lucide-react";
import { useIntl } from "react-intl";

import { useAuth } from "@/auth/useAuth";
import { ConfirmDialog } from "@/components/servers/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { TOOL_CANCEL_REVEAL_DELAY_MS } from "@/config/toolInvocation";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { ToolInvokeState } from "@/hooks/useToolInvoke";
import type { Tool } from "@/types/tool";
import { getToolAnnotationHints } from "./toolAnnotations";

export type ToolLiveInvokeAvailability =
  | { state: "checkingAccess" }
  | { state: "missingPermission"; permission: "tools.execute" | "servers.use" }
  | { state: "available" }
  | { state: "requiresConfirmation" }
  | { state: "unavailableInvalidGateway" }
  | { state: "unavailableFederated" }
  | { state: "unavailableUntagged" };

export interface ResolveToolLiveInvokeAvailabilityInput {
  canExecute: boolean;
  canUseServers: boolean;
  permissionsLoading: boolean;
  invalidGatewayId?: boolean;
  tool: Pick<Tool, "annotations" | "gatewayId">;
}

export function resolveToolLiveInvokeAvailability({
  canExecute,
  canUseServers,
  permissionsLoading,
  invalidGatewayId = false,
  tool,
}: ResolveToolLiveInvokeAvailabilityInput): ToolLiveInvokeAvailability {
  if (permissionsLoading) return { state: "checkingAccess" };
  if (!canExecute) return { state: "missingPermission", permission: "tools.execute" };
  if (!canUseServers) return { state: "missingPermission", permission: "servers.use" };
  if (invalidGatewayId || (typeof tool.gatewayId === "string" && !tool.gatewayId.trim())) {
    return { state: "unavailableInvalidGateway" };
  }

  const hints = getToolAnnotationHints(tool.annotations);
  const isFederated = Boolean(tool.gatewayId);

  // Future #5437 approval states should plug in here before deciding that a
  // non-read-only tool remains unavailable from this drawer.
  if (hints.destructiveHint) {
    return isFederated ? { state: "unavailableFederated" } : { state: "requiresConfirmation" };
  }

  if (hints.readOnlyHint) return { state: "available" };
  if (isFederated) return { state: "unavailableFederated" };

  return { state: "unavailableUntagged" };
}

export interface ToolLiveInvokeGateProps {
  disabled?: boolean;
  invalidGatewayId?: boolean;
  invoke: Pick<ToolInvokeState, "run" | "stopWaiting" | "isLoading" | "hasRun">;
  onBeforeRun?: () => boolean;
  presentation?: "live" | "tool";
  tool: Tool;
}

export function ToolLiveInvokeGate({
  disabled = false,
  invalidGatewayId = false,
  invoke,
  onBeforeRun,
  presentation = "live",
  tool,
}: ToolLiveInvokeGateProps) {
  const intl = useIntl();
  const { hasPermission, permissionsLoading } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const loadingTransition = useMemo(() => ({ isLoading: invoke.isLoading }), [invoke.isLoading]);
  const debouncedLoadingTransition = useDebouncedValue(
    loadingTransition,
    TOOL_CANCEL_REVEAL_DELAY_MS,
  );

  const showCancelRequest = invoke.isLoading && debouncedLoadingTransition === loadingTransition;

  const run = () => {
    if (onBeforeRun?.() === false) return;
    void invoke.run();
  };
  const availability = useMemo(
    () =>
      resolveToolLiveInvokeAvailability({
        canExecute: hasPermission("tools.execute"),
        canUseServers: hasPermission("servers.use"),
        permissionsLoading,
        invalidGatewayId,
        tool,
      }),
    [hasPermission, permissionsLoading, invalidGatewayId, tool],
  );

  if (invoke.isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" size="sm" disabled aria-busy="true">
          <Loader2 className="size-3.5 animate-spin" />
          {intl.formatMessage({ id: "tools.details.invoke.running" })}
        </Button>
        {showCancelRequest && (
          <Button type="button" variant="outline" size="sm" onClick={invoke.stopWaiting}>
            <Square className="size-3.5" />
            {intl.formatMessage({ id: "tools.details.invoke.stopWaiting" })}
          </Button>
        )}
      </div>
    );
  }

  if (availability.state === "available") {
    const ActionIcon = presentation === "tool" ? Zap : Play;
    return (
      <Button type="button" variant="default" size="sm" onClick={run} disabled={disabled}>
        <ActionIcon className="size-3.5" />
        {intl.formatMessage({
          id:
            presentation === "tool"
              ? invoke.hasRun
                ? "tools.details.invoke.rerunTool"
                : "tools.details.invoke.runTool"
              : invoke.hasRun
                ? "tools.details.invoke.rerun"
                : "tools.details.invoke.run",
        })}
      </Button>
    );
  }

  if (availability.state === "requiresConfirmation") {
    const ActionIcon = presentation === "tool" ? Zap : Play;
    return (
      <>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            if (onBeforeRun?.() === false) return;
            setConfirmOpen(true);
          }}
          disabled={disabled}
        >
          <ActionIcon className="size-3.5" />
          {intl.formatMessage({
            id:
              presentation === "tool"
                ? invoke.hasRun
                  ? "tools.details.invoke.rerunTool"
                  : "tools.details.invoke.runTool"
                : invoke.hasRun
                  ? "tools.details.invoke.rerun"
                  : "tools.details.invoke.run",
          })}
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={intl.formatMessage({ id: "tools.details.invoke.confirm.title" })}
          description={intl.formatMessage(
            { id: "tools.details.invoke.confirm.description" },
            { name: tool.name },
          )}
          confirmLabel={intl.formatMessage({ id: "tools.details.invoke.confirm.button" })}
          cancelLabel={intl.formatMessage({ id: "tools.details.invoke.confirm.cancel" })}
          variant="destructive"
          role="alertdialog"
          onConfirm={invoke.run}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled>
        {availability.state === "checkingAccess"
          ? intl.formatMessage({ id: "tools.details.invoke.checkingAccess" })
          : intl.formatMessage({ id: "tools.details.invoke.run" })}
      </Button>
      <p className="max-w-xs text-right text-[12px] leading-4 text-muted-foreground">
        {getToolLiveInvokeAvailabilityMessage(availability, intl.formatMessage)}
      </p>
    </div>
  );
}

export function getToolLiveInvokeAvailabilityMessage(
  availability: ToolLiveInvokeAvailability,
  formatMessage: (descriptor: { id: string }) => string,
) {
  switch (availability.state) {
    case "checkingAccess":
      return formatMessage({ id: "tools.details.invoke.unavailable.checkingAccess" });
    case "missingPermission":
      return formatMessage({
        id:
          availability.permission === "tools.execute"
            ? "tools.details.invoke.unavailable.missingExecutePermission"
            : "tools.details.invoke.unavailable.missingServerUsePermission",
      });
    case "unavailableFederated":
      return formatMessage({ id: "tools.details.invoke.unavailable.federated" });
    case "unavailableInvalidGateway":
      return formatMessage({ id: "tools.details.invoke.unavailable.invalidGateway" });
    case "unavailableUntagged":
      return formatMessage({ id: "tools.details.invoke.unavailable.untagged" });
    case "available":
    case "requiresConfirmation":
      return "";
  }
}
