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
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (value: string) => {
      const requestId = ++requestIdRef.current;
      const ok = await copyToClipboard(value);

      // Ignore this result if a later copy() has since been fired (so an
      // older request resolving out of order can't clobber newer feedback)
      // or the component has unmounted (so we don't set state or schedule
      // an uncleared timer after teardown).
      if (!mountedRef.current || requestId !== requestIdRef.current) return ok;

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
