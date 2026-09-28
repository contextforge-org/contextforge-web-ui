import { useCallback, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { truncateMiddle } from "@/components/gateways/utils";
import { cn } from "@/lib/utils";

/**
 * Middle-truncates `value` for display and reports whether it actually did.
 * A plain function (not a hook) so it can run inside `.map()` for lists of
 * tabs/rows without violating the rules of hooks.
 */
export function getTruncatedMiddle(value: string, maxLength = 24) {
  return { display: truncateMiddle(value, maxLength), isTruncated: value.length > maxLength };
}

export interface TruncatedMiddleTextProps {
  /** The full, untruncated value. */
  value: string;
  /** Passed through to `truncateMiddle`. */
  maxLength?: number;
  className?: string;
}

/**
 * Middle-truncates `value` for display; when truncation actually shortened
 * it, wraps the result in a hover tooltip carrying the full value.
 *
 * Unlike `TruncatedText`, the full string never reaches the DOM here — it's
 * shortened before render — so a visually-hidden span carries the full value
 * for screen readers regardless of the tooltip's hover state. This is
 * deliberately *not* `aria-label`: values here are often arbitrary data (IDs,
 * URI templates, ...) that can coincidentally contain words matching an
 * unrelated label query elsewhere on the page, and `aria-label` would give
 * this plain `<span>` an accessible name that generic label-based queries
 * (`getByLabel`, `getByRole(..., { name })`) can match against.
 */
export function TruncatedMiddleText({
  value,
  maxLength = 24,
  className,
}: TruncatedMiddleTextProps) {
  const { display, isTruncated } = getTruncatedMiddle(value, maxLength);
  const [isClipped, setIsClipped] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Tail length matches `truncateMiddle`'s edge, so the end stays visible.
  const tailLength = Math.max(4, Math.floor((maxLength - 3) / 2));
  const canSplit = display.length > tailLength;

  // Head shrinks with a CSS ellipsis when even `display` is too wide; tail never shrinks.
  const headRef = useCallback((node: HTMLSpanElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;

    const measure = () => setIsClipped(node.scrollWidth > node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const showFull = isTruncated || isClipped;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("flex min-w-0 overflow-hidden whitespace-nowrap", className)}>
          {canSplit ? (
            <span aria-hidden={isTruncated || undefined} className="flex min-w-0">
              <span ref={headRef} className="min-w-0 truncate">
                {display.slice(0, -tailLength)}
              </span>
              <span className="shrink-0">{display.slice(-tailLength)}</span>
            </span>
          ) : (
            <span aria-hidden={isTruncated || undefined}>{display}</span>
          )}
          {isTruncated && <span className="sr-only">{value}</span>}
        </span>
      </TooltipTrigger>
      {showFull && <TooltipContent>{value}</TooltipContent>}
    </Tooltip>
  );
}
