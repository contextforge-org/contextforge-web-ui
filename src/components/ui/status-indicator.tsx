import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  Icon: LucideIcon;
  /** Applies to the icon only; the label always stays muted. */
  iconClassName: string;
  /** The visible label. Pass the abbreviated form where the column is narrow. */
  label: string;
  /** The unabbreviated label, announced in place of `label` when the two differ. */
  fullLabel?: string;
  /** Accessible name for the trigger. Required wherever `children` are given. */
  triggerAriaLabel?: string;
  /** Accessible name for the popover, which Radix leaves unnamed. */
  contentAriaLabel?: string;
  size?: "xs" | "sm";
  /** Render as plain text rather than a button. Required inside another button. */
  interactive?: boolean;
  /** Popover contents. Without them the indicator has nothing to open and stays plain text. */
  children?: ReactNode;
  className?: string;
}

const SIZE_CLASS = {
  xs: "text-xs",
  sm: "text-sm",
} as const;

/**
 * Status icon and label, optionally opening a popover that explains the state.
 *
 * Presentation only: callers classify their own subject and pass the icon, tone
 * and copy. Consumers are the MCP server status indicator, the catalog card and
 * the source picker, which share this shape but not their state models.
 */
export function StatusIndicator({
  Icon,
  iconClassName,
  label,
  fullLabel,
  triggerAriaLabel,
  contentAriaLabel,
  size = "xs",
  interactive = true,
  children,
  className,
}: StatusIndicatorProps) {
  const isAbbreviated = Boolean(fullLabel && fullLabel !== label);
  const layout = cn("inline-flex items-center gap-1.5", SIZE_CLASS[size]);

  const content = (
    <>
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", iconClassName)}
        aria-hidden="true"
        focusable="false"
      />
      <span className="text-muted-foreground" aria-hidden={isAbbreviated || undefined}>
        {label}
      </span>
      {isAbbreviated && <span className="sr-only">{fullLabel}</span>}
    </>
  );

  if (!interactive || !children) {
    return <span className={cn(layout, className)}>{content}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={triggerAriaLabel}
        className={cn(
          layout,
          "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {content}
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={contentAriaLabel} className="w-auto max-w-xs p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}
