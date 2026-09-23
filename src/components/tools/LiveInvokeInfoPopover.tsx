import { Info } from "lucide-react";
import { useIntl } from "react-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface LiveInvokeInfoPopoverProps {
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Info popover beside the "Live invocation" label explaining what each mode
 * does, since nothing else on screen does: preview validates arguments and
 * resolves the source locally, live invocation actually contacts it.
 *
 * A popover (not a tooltip) so the explanation is reachable on touch devices
 * and its content stays hoverable/dismissible per WCAG 1.4.13 — matches
 * `VisibilityInfoPopover`.
 */
export function LiveInvokeInfoPopover({ className, side = "right" }: LiveInvokeInfoPopoverProps) {
  const intl = useIntl();

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={intl.formatMessage({ id: "tools.details.test.liveModeInfo.trigger" })}
        className={cn(
          "rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent side={side} className="w-auto max-w-xs space-y-1 p-3 text-sm">
        <p>{intl.formatMessage({ id: "tools.details.test.liveModeInfo.preview" })}</p>
        <p>{intl.formatMessage({ id: "tools.details.test.liveModeInfo.live" })}</p>
      </PopoverContent>
    </Popover>
  );
}
