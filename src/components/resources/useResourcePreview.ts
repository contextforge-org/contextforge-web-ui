import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import { resourcesApi, type ResourceTestContent } from "@/api/resources";
import { parseApiError } from "@/lib/errorUtils";

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

  // Clear stale result/error when the caller switches to a different resource.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [uri]);

  // Abort any in-flight preview when the hook unmounts (the host component
  // is keyed by resource id, so this also fires on resource switch).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  const run = useCallback(async () => {
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

  return {
    run,
    reset,
    isLoading,
    result,
    error,
    hasRun: result !== null || error !== null,
  };
}
