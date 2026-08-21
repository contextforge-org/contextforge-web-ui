import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import { resourcesApi, type ResourceTestContent } from "@/api/resources";
import { parseApiError } from "@/lib/errorUtils";

// Rapid repeated triggers (double-clicking Preview, mashing Enter on the
// focused button) collapse into a single fetch instead of one request per
// click — trailing-edge debounce, so only the last call in a burst runs.
const RUN_DEBOUNCE_MS = 300;

export interface ResourcePreviewSuccess {
  content: ResourceTestContent;
  renderTimeMs: number;
  status: number;
}

export interface ResourcePreviewFailure {
  message: string;
  renderTimeMs: number;
  status: number | null;
}

export interface ResourcePreviewState {
  run: () => Promise<void>;
  reset: () => void;
  isLoading: boolean;
  result: ResourcePreviewSuccess | null;
  error: ResourcePreviewFailure | null;
  hasRun: boolean;
}

/**
 * Owns the render-only Preview lifecycle for a resource — same abort /
 * timing / error shape as {@link usePromptPreview}, adapted to the resource
 * test endpoint (`GET /v1/resources/test/{uri}`) instead of the
 * prompt render endpoint.
 *
 * `uri` is the *concrete* URI — the caller resolves any `{placeholder}`
 * template variables (see `parseUriTemplate.resolveUriTemplate`) before
 * passing it in.
 */
export function useResourcePreview(uri: string): ResourcePreviewState {
  const intl = useIntl();
  const [isLoading, setLoading] = useState(false);
  const [result, setResult] = useState<ResourcePreviewSuccess | null>(null);
  const [error, setError] = useState<ResourcePreviewFailure | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // Clear stale result/error when the caller switches to a different resource.
  useEffect(() => {
    setResult(null);
    setError(null);
    clearDebounce();
  }, [uri, clearDebounce]);

  // Abort any in-flight preview / pending debounce when the hook unmounts
  // (the host component is keyed by resource id, so this also fires on
  // resource switch).
  useEffect(() => {
    return () => {
      clearDebounce();
      abortRef.current?.abort();
    };
  }, [clearDebounce]);

  const reset = useCallback(() => {
    clearDebounce();
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, [clearDebounce]);

  const executeRun = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const { content, status } = await resourcesApi.test(uri, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const renderTimeMs = Math.round(performance.now() - startedAt);
      setResult({ content, renderTimeMs, status });
    } catch (err) {
      if (controller.signal.aborted) return;
      const renderTimeMs = Math.round(performance.now() - startedAt);
      const status = err instanceof ApiError ? err.status : null;
      const message = parseApiError(err, err instanceof Error ? err.message : "Unknown error");
      setError({ message, renderTimeMs, status });
      setResult(null);
      toast.error(intl.formatMessage({ id: "resources.details.preview.error" }));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [uri, intl]);

  const run = useMemo(() => {
    return () =>
      new Promise<void>((resolve) => {
        clearDebounce();
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          resolve(executeRun());
        }, RUN_DEBOUNCE_MS);
      });
  }, [executeRun, clearDebounce]);

  return {
    run,
    reset,
    isLoading,
    result,
    error,
    hasRun: result !== null || error !== null,
  };
}
