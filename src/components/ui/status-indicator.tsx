import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  Icon: LucideIcon;
  /** Applies to the icon only. */
  iconClassName: string;
  /** Overrides the muted label colour, which the catalog card does. */
  labelClassName?: string;
  /** The visible label. Pass the abbreviated form where the column is narrow. */
  label: string;
  /** The unabbreviated label, announced in place of `label` when the two differ. */
  fullLabel?: string;
  /**
   * Overrides the name the visible label gives the trigger. Pass it where the
   * label alone does not say what the status is about.
   */
  triggerAriaLabel?: string;
  /** Accessible name for the popover, which Radix leaves unnamed. Falls back to the label. */
  contentAriaLabel?: string;
  size?: "xs" | "sm";
  /** Popover contents. Without them the indicator has nothing to open and stays plain text. */
  children?: ReactNode;
  /** Fires on open and on close, for a caller that treats reading the popover as an action. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const LAYOUT_CLASS = "inline-flex items-center gap-1.5";
const SIZE_CLASS = {
  xs: "text-xs",
  sm: "text-sm",
} as const;
const TRIGGER_CLASS =
  "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The interactive shell, for a caller whose trigger holds something this cannot render. */
export const STATUS_INDICATOR_TRIGGER_CLASS = cn(LAYOUT_CLASS, SIZE_CLASS.xs, TRIGGER_CLASS);

/** The status icon, shared with a caller that builds its own trigger. */
export function StatusIndicatorIcon({ Icon, className }: { Icon: LucideIcon; className?: string }) {
  return (
    <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden="true" focusable="false" />
  );
}

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
  labelClassName = "text-muted-foreground",
  label,
  fullLabel,
  triggerAriaLabel,
  contentAriaLabel,
  size = "xs",
  children,
  onOpenChange,
  className,
}: StatusIndicatorProps) {
  const isAbbreviated = Boolean(fullLabel && fullLabel !== label);
  const layout = cn(LAYOUT_CLASS, SIZE_CLASS[size]);

  const content = (
    <>
      <StatusIndicatorIcon Icon={Icon} className={iconClassName} />
      <span className={labelClassName} aria-hidden={isAbbreviated || undefined}>
        {label}
      </span>
      {isAbbreviated && <span className="sr-only">{fullLabel}</span>}
    </>
  );

  if (!children) {
    return <span className={cn(layout, className)}>{content}</span>;
  }

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger
        type="button"
        aria-label={triggerAriaLabel}
        className={cn(layout, TRIGGER_CLASS, className)}
      >
        {content}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // `||` not `??`: a blank label must fall through rather than leave the dialog unnamed.
        aria-label={contentAriaLabel || fullLabel || label}
        className="w-auto max-w-xs p-3"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
