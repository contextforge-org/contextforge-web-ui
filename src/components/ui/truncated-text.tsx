import { useCallback, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Slot } from "radix-ui";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TruncatedTextProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  children: ReactNode;
  /** Forwarded to `TooltipContent`. */
  side?: "top" | "right" | "bottom" | "left";
  /**
   * Merge the truncation ref/behavior onto `children` instead of rendering a
   * wrapping `<span>` — for when the truncated element must itself be
   * interactive (e.g. a `<button>` that also has an `onClick`). `children`
   * must be a single element that already carries its own `.truncate`-style
   * className.
   */
  asChild?: boolean;
  /**
   * Content shown in the tooltip when the text is clipped. Defaults to
   * `children`; pass this explicitly when `children` is a whole element
   * (`asChild`) rather than the plain text itself.
   */
  tooltipContent?: ReactNode;
}

/**
 * Renders `children` in a CSS-truncated (`.truncate`) span (or, with
 * `asChild`, merges the same behavior directly onto a single child element)
 * and shows a hover tooltip with the full content, but only when the text is
 * actually clipped at its current rendered width — a `ResizeObserver`
 * re-measures `scrollWidth` vs. `clientWidth` whenever the element's size
 * changes, so the tooltip appears and disappears as the layout (column
 * width, viewport, sidebar collapse, ...) changes.
 *
 * The full text stays in the DOM regardless of visual truncation, so it's
 * available to screen readers without needing the tooltip.
 */
export function TruncatedText({
  children,
  className,
  side,
  asChild = false,
  tooltipContent,
  ...props
}: TruncatedTextProps) {
  const [isTruncated, setIsTruncated] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback((node: HTMLElement) => {
    setIsTruncated(node.scrollWidth > node.clientWidth);
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;

      measure(node);
      const observer = new ResizeObserver(() => measure(node));
      observer.observe(node);
      observerRef.current = observer;
    },
    [measure],
  );

  const Comp = asChild ? Slot.Root : "span";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Comp ref={ref} className={cn(!asChild && "block truncate", className)} {...props}>
          {children}
        </Comp>
      </TooltipTrigger>
      {isTruncated && <TooltipContent side={side}>{tooltipContent ?? children}</TooltipContent>}
    </Tooltip>
  );
}
