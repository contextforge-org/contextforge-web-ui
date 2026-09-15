import { useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseApiError } from "@/lib/errorUtils";
import { getAvailabilityPresentation, type ServerAvailability } from "@/lib/serverStatus";
import { formatLocalDateTime } from "@/utils/formatDate";

interface ServerStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
  availability: ServerAvailability;
  lastSeen?: string | null;
  lastError?: string | null;
  /** Offered for `auth`. Omit where the caller cannot act. */
  onAuthorize?: () => Promise<void>;
  /** Offered for `inactive`. */
  onEnable?: () => Promise<void>;
}

/** Detail for a server status: what the state means, and the action that clears it. */
export function ServerStatusDialog({
  open,
  onOpenChange,
  serverName,
  availability,
  lastSeen,
  lastError,
  onAuthorize,
  onEnable,
}: ServerStatusDialogProps) {
  const intl = useIntl();
  const [isPending, setIsPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const presentation = getAvailabilityPresentation(availability);
  const StatusIcon = presentation.Icon;

  const action =
    availability === "auth" && onAuthorize
      ? {
          run: onAuthorize,
          labelId: "mcpServer.status.action.authorize",
          pendingId: "mcpServer.status.action.authorizing",
        }
      : availability === "inactive" && onEnable
        ? {
            run: onEnable,
            labelId: "mcpServer.status.action.enable",
            pendingId: "mcpServer.status.action.enabling",
          }
        : null;

  const runAction = async () => {
    if (!action) return;
    setIsPending(true);
    setActionError(null);
    try {
      await action.run();
      onOpenChange(false);
    } catch (error) {
      setActionError(
        parseApiError(
          error,
          error instanceof Error ? error.message : intl.formatMessage({ id: "common.error" }),
        ),
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <StatusIcon
              className={`size-4 shrink-0 ${presentation.iconClassName}`}
              aria-hidden="true"
            />
            <DialogTitle>{intl.formatMessage({ id: presentation.labelId })}</DialogTitle>
          </div>
          <DialogDescription>{serverName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-foreground">{intl.formatMessage({ id: presentation.detailId })}</p>
          {lastSeen && (
            <p className="text-muted-foreground">
              {intl.formatMessage(
                { id: "mcpServer.status.detail.lastSeen" },
                { timestamp: formatLocalDateTime(lastSeen, "") },
              )}
            </p>
          )}
          {lastError && (
            <p className="break-words text-muted-foreground">
              {intl.formatMessage(
                { id: "mcpServer.status.detail.lastError" },
                { error: lastError },
              )}
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-destructive">
              {intl.formatMessage({ id: "mcpServer.status.action.error" }, { error: actionError })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {intl.formatMessage({ id: "common.button.close" })}
          </Button>
          {action && (
            <Button type="button" onClick={runAction} disabled={isPending}>
              {intl.formatMessage({ id: isPending ? action.pendingId : action.labelId })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
