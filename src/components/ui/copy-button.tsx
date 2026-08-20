import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useIntl } from "react-intl";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils";

export interface CopyButtonProps {
  /** The value written to the clipboard. */
  value: string;
  /** Accessible label and idle hover-tooltip text, e.g. "Copy resource ID". */
  label: string;
  size?: VariantProps<typeof buttonVariants>["size"];
  /** Icon size class. Defaults to the size most call sites use. */
  iconClassName?: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Icon button that copies `value` to the clipboard and confirms it happened.
 *
 * The tooltip stays uncontrolled on hover/focus (so the ordinary "Copy X"
 * hint keeps working) but is force-opened on copy, so touch users — who never
 * fire a hover event — still see the confirmation. `aria-label` stays fixed
 * at `label`; a single `role="status"` region announces the transient
 * copied/failed state instead, so the two don't double-announce.
 */
export function CopyButton({
  value,
  label,
  size = "icon-xs",
  iconClassName = "size-3.5",
  className,
  side = "top",
}: CopyButtonProps) {
  const intl = useIntl();
  const [hoverOpen, setHoverOpen] = useState(false);
  const { status, copy } = useCopyToClipboard();
  const copied = status === "copied";
  const failed = status === "error";
  const copiedLabel = intl.formatMessage({ id: "common.copied" });
  const failedLabel = intl.formatMessage({ id: "common.copyFailed" });
  const tooltipLabel = copied ? copiedLabel : failed ? failedLabel : label;

  return (
    <>
      <Tooltip open={copied || failed || hoverOpen} onOpenChange={setHoverOpen} delayDuration={400}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={size}
            aria-label={label}
            className={className}
            onClick={(e) => {
              e.stopPropagation();
              void copy(value);
            }}
          >
            {copied ? (
              <Check className={cn(iconClassName, "text-emerald-600 dark:text-emerald-400")} />
            ) : (
              <Copy className={iconClassName} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>{tooltipLabel}</TooltipContent>
      </Tooltip>
      {(copied || failed) && (
        <span role="status" className="sr-only">
          {copied ? copiedLabel : failedLabel}
        </span>
      )}
    </>
  );
}
