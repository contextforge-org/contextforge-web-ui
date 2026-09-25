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
  /**
   * Overrides the name the visible label gives the trigger. Pass it where the
   * label alone does not say what the status is about.
   */
  triggerAriaLabel?: string;
  /** Accessible name for the popover, which Radix leaves unnamed. Falls back to the label. */
  contentAriaLabel?: string;
  /** Render as plain text rather than a button. Required inside another button. */
  interactive?: boolean;
  /** Popover contents. Without them the indicator has nothing to open and stays plain text. */
  children?: ReactNode;
  className?: string;
}

const LAYOUT_CLASS = "inline-flex items-center gap-1.5 text-xs";
const TRIGGER_CLASS =
  "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The interactive shell, for a caller whose trigger holds something this cannot render. */
export const STATUS_INDICATOR_TRIGGER_CLASS = cn(LAYOUT_CLASS, TRIGGER_CLASS);

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
 * and copy, so that subjects with unrelated state models still read alike.
 */
export function StatusIndicator({
  Icon,
  iconClassName,
  label,
  fullLabel,
  triggerAriaLabel,
  contentAriaLabel,
  interactive = true,
  children,
  className,
}: StatusIndicatorProps) {
  const isAbbreviated = Boolean(fullLabel && fullLabel !== label);

  const content = (
    <>
      <StatusIndicatorIcon Icon={Icon} className={iconClassName} />
      <span className="text-muted-foreground" aria-hidden={isAbbreviated || undefined}>
        {label}
      </span>
      {isAbbreviated && <span className="sr-only">{fullLabel}</span>}
    </>
  );

  if (!interactive || !children) {
    return <span className={cn(LAYOUT_CLASS, className)}>{content}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={triggerAriaLabel}
        className={cn(LAYOUT_CLASS, TRIGGER_CLASS, className)}
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
