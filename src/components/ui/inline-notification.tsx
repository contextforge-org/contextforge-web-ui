import { forwardRef } from "react";
import { CircleCheck, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InlineNotificationProps {
  type: "success" | "error";
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
    const isSuccess = type === "success";

    return (
      <div
        ref={ref}
        role={isSuccess ? "status" : "alert"}
        tabIndex={tabIndex}
        className="flex items-center justify-between rounded-md border border-neutral-200 bg-background p-3 dark:border-neutral-800"
      >
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CircleCheck className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
          ) : (
            <CircleAlert className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          )}
          <p
            className={`text-sm ${isSuccess ? "text-green-500" : "text-red-600 dark:text-red-400"}`}
          >
            {message}
          </p>
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
