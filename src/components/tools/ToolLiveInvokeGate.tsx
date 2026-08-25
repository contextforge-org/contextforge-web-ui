import { useMemo, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { useIntl } from "react-intl";

import { useAuth } from "@/auth/useAuth";
import { ConfirmDialog } from "@/components/servers/ConfirmDialog";
import { Button } from "@/components/ui/button";
import type { ToolInvokeState } from "@/hooks/useToolInvoke";
import type { Tool } from "@/types/tool";
import { getToolAnnotationHints } from "./toolAnnotations";

export type ToolLiveInvokeAvailability =
  | { state: "checkingAccess" }
  | { state: "missingPermission" }
  | { state: "available" }
  | { state: "requiresConfirmation" }
  | { state: "unavailableFederated" }
  | { state: "unavailableUntagged" };

export interface ResolveToolLiveInvokeAvailabilityInput {
  canExecute: boolean;
  permissionsLoading: boolean;
  tool: Pick<Tool, "annotations" | "gatewayId">;
}

export function resolveToolLiveInvokeAvailability({
  canExecute,
  permissionsLoading,
  tool,
}: ResolveToolLiveInvokeAvailabilityInput): ToolLiveInvokeAvailability {
  if (permissionsLoading) return { state: "checkingAccess" };
  if (!canExecute) return { state: "missingPermission" };

  const hints = getToolAnnotationHints(tool.annotations);
  if (hints.readOnlyHint) return { state: "available" };

  const isFederated = Boolean(tool.gatewayId);
  if (isFederated) return { state: "unavailableFederated" };

  // Future #5437 approval states should plug in here before deciding that a
  // non-read-only tool remains unavailable from this drawer.
  if (hints.destructiveHint) return { state: "requiresConfirmation" };

  return { state: "unavailableUntagged" };
}

export interface ToolLiveInvokeGateProps {
  disabled?: boolean;
  invoke: Pick<ToolInvokeState, "run" | "stopWaiting" | "isLoading" | "hasRun">;
  tool: Tool;
}

export function ToolLiveInvokeGate({ disabled = false, invoke, tool }: ToolLiveInvokeGateProps) {
  const intl = useIntl();
  const { hasPermission, permissionsLoading } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const availability = useMemo(
    () =>
      resolveToolLiveInvokeAvailability({
        canExecute: hasPermission("tools.execute"),
        permissionsLoading,
        tool,
      }),
    [hasPermission, permissionsLoading, tool],
  );

  if (invoke.isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" size="sm" disabled aria-busy="true">
          <Loader2 className="size-3.5 animate-spin" />
          {intl.formatMessage({ id: "tools.details.invoke.running" })}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={invoke.stopWaiting}>
          <Square className="size-3.5" />
          {intl.formatMessage({ id: "tools.details.invoke.stopWaiting" })}
        </Button>
      </div>
    );
  }

  if (availability.state === "available") {
    return (
      <Button type="button" variant="default" size="sm" onClick={invoke.run} disabled={disabled}>
        <Play className="size-3.5" />
        {intl.formatMessage({
          id: invoke.hasRun ? "tools.details.invoke.rerun" : "tools.details.invoke.run",
        })}
      </Button>
    );
  }

  if (availability.state === "requiresConfirmation") {
    return (
      <>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled}
        >
          <Play className="size-3.5" />
          {intl.formatMessage({
            id: invoke.hasRun ? "tools.details.invoke.rerun" : "tools.details.invoke.run",
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
        {availabilityMessage(availability, intl.formatMessage)}
      </p>
    </div>
  );
}

function availabilityMessage(
  availability: ToolLiveInvokeAvailability,
  formatMessage: (descriptor: { id: string }) => string,
) {
  switch (availability.state) {
    case "checkingAccess":
      return formatMessage({ id: "tools.details.invoke.unavailable.checkingAccess" });
    case "missingPermission":
      return formatMessage({ id: "tools.details.invoke.unavailable.missingPermission" });
    case "unavailableFederated":
      return formatMessage({ id: "tools.details.invoke.unavailable.federated" });
    case "unavailableUntagged":
      return formatMessage({ id: "tools.details.invoke.unavailable.untagged" });
    case "available":
    case "requiresConfirmation":
      return "";
  }
}
