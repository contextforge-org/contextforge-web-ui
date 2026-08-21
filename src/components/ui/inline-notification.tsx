import { forwardRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATUS_ICON, STATUS_TONE_CLASS } from "@/lib/status";

interface InlineNotificationProps {
  type: "success" | "error" | "info";
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: () => void;
  dismissLabel?: string;
  tabIndex?: number;
}

export const InlineNotification = forwardRef<HTMLDivElement, InlineNotificationProps>(
  function InlineNotification(
    { type, message, action, onDismiss, dismissLabel = "Dismiss notification", tabIndex },
    ref,
  ) {
    const isError = type === "error";
    const Icon = STATUS_ICON[type];
    const toneClass = STATUS_TONE_CLASS[type];

    return (
      <div
        ref={ref}
        role={isError ? "alert" : "status"}
        tabIndex={tabIndex}
        className="flex items-center justify-between rounded-md border border-neutral-200 bg-background p-3 dark:border-neutral-800"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${toneClass}`} aria-hidden="true" />
          <p className={`text-sm ${toneClass}`}>{message}</p>
        </div>
        {(action || onDismiss) && (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {action && (
              <Button type="button" variant="outline" size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            )}
            {onDismiss && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onDismiss}
                aria-label={dismissLabel}
                className="p-1 opacity-60 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  },
);
