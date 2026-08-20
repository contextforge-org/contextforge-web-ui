import { useCallback, useEffect, useRef, useState } from "react";

import { copyToClipboard } from "@/lib/clipboard";

export type CopyStatus = "idle" | "copied" | "error";

/**
 * Writes a value to the clipboard and exposes transient `copied`/`error`
 * feedback that resets to `idle` after `resetDelayMs`. A rapid second copy
 * restarts the timer rather than stacking resets.
 */
export function useCopyToClipboard(resetDelayMs = 1500) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (value: string) => {
      const ok = await copyToClipboard(value);
      setStatus(ok ? "copied" : "error");
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setStatus("idle");
        timeoutRef.current = null;
      }, resetDelayMs);
      return ok;
    },
    [resetDelayMs],
  );

  return { status, copy };
}
