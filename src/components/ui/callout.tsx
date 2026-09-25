import type { HTMLAttributes, ReactNode } from "react";
import { STATUS_ICON, STATUS_TONE_CLASS, type StatusSeverity } from "@/lib/status";
import { cn } from "@/lib/utils";

interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  severity: StatusSeverity;
  children: ReactNode;
}

/**
 * Persistent inline advisory: a filled box with the canonical status icon and
 * rich-text content. It has no actions or dismiss control — use
 * InlineNotification for transient, actionable feedback.
 */
export function Callout({ severity, children, className, role, ...props }: CalloutProps) {
  const Icon = STATUS_ICON[severity];

  return (
    <div
      role={role ?? (severity === "error" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-2 rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", STATUS_TONE_CLASS[severity])}
        aria-hidden="true"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
