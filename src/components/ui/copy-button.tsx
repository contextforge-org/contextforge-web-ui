import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import { useIntl } from "react-intl";
import { useFloating, offset, flip, shift } from "@floating-ui/react-dom";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils";

export interface CopyButtonProps {
  /** The value written to the clipboard. */
  value: string;
  /** Accessible label, e.g. "Copy resource ID". Not shown on hover or focus. */
  label: string;
  size?: VariantProps<typeof buttonVariants>["size"];
  /** Icon size class. Defaults to the size most call sites use. */
  iconClassName?: string;
  className?: string;
}

/**
 * Icon button that copies `value` to the clipboard and confirms it happened.
 *
 * The confirmation bubble appears on click only — hover and focus show
 * nothing, so it never fights a dialog's Escape handling (see
 * react-dismissable-layer). It's a plain `aria-hidden` span positioned with
 * `@floating-ui/react-dom` and portaled to `document.body` so it can't clip
 * inside a scrolling table or dialog. `aria-label` stays fixed at `label`;
 * a single always-mounted `role="status"` region is the one non-visual
 * announcement channel for the transient copied/failed state.
 */
export function CopyButton({
  value,
  label,
  size = "icon-xs",
  iconClassName = "size-3.5",
  className,
}: CopyButtonProps) {
  const intl = useIntl();
  const { status, copy } = useCopyToClipboard();
  const copied = status === "copied";
  const failed = status === "error";
  const copiedLabel = intl.formatMessage({ id: "common.copied" });
  const failedLabel = intl.formatMessage({ id: "common.copyFailed" });

  const { refs, floatingStyles } = useFloating({
    placement: "top",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });

  return (
    <>
      <Button
        ref={refs.setReference}
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
      {(copied || failed) &&
        createPortal(
          <span
            ref={refs.setFloating}
            style={floatingStyles}
            aria-hidden="true"
            className="z-[60] inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
          >
            {copied ? copiedLabel : failedLabel}
          </span>,
          document.body,
        )}
      {/* Always mounted, so the text change on copy is what gets announced. */}
      <span role="status" className="sr-only">
        {copied ? copiedLabel : failed ? failedLabel : ""}
      </span>
    </>
  );
}
