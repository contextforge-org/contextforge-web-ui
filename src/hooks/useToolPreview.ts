import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import { toolsApi, type ToolPreviewResponse } from "@/api/tools";
import { parseApiError } from "@/lib/errorUtils";

export interface ToolPreviewSuccess {
  preview: ToolPreviewResponse;
  renderTimeMs: number;
  status: number;
}

export interface ToolPreviewFailure {
  message: string;
  renderTimeMs: number;
  status: number | null;
}

export interface ToolPreviewState {
  run: () => Promise<void>;
  reset: () => void;
  isLoading: boolean;
  result: ToolPreviewSuccess | null;
  error: ToolPreviewFailure | null;
  hasRun: boolean;
}

export interface UseToolPreviewOptions {
  enabled?: boolean;
}

export function useToolPreview(
  toolName: string,
  args: Record<string, unknown>,
  passthroughHeaders: Record<string, string>,
  options: UseToolPreviewOptions = {},
): ToolPreviewState {
  const intl = useIntl();
  const enabled = options.enabled ?? true;
  const [isLoading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolPreviewSuccess | null>(null);
  const [error, setError] = useState<ToolPreviewFailure | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, [enabled, toolName]);

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
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const { preview, status } = await toolsApi.preview(toolName, args, passthroughHeaders, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const renderTimeMs = Math.round(performance.now() - startedAt);
      setResult({ preview, status, renderTimeMs });
    } catch (err) {
      if (controller.signal.aborted) return;
      const renderTimeMs = Math.round(performance.now() - startedAt);
      const status = err instanceof ApiError ? err.status : null;
      const message = parseApiError(err, err instanceof Error ? err.message : "Unknown error");
      setError({ message, renderTimeMs, status });
      setResult(null);
      toast.error(intl.formatMessage({ id: "tools.details.preview.error" }));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [enabled, toolName, args, passthroughHeaders, intl]);

  return {
    run,
    reset,
    isLoading,
    result,
    error,
    hasRun: result !== null || error !== null,
  };
}
