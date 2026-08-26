import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import {
  ToolInvokeJsonRpcError,
  toolsApi,
  type ToolInvokeRequestId,
  type ToolPreviewResponse,
} from "@/api/tools";
import { parseApiError } from "@/lib/errorUtils";

export const TOOL_INVOKE_TIMEOUT_MS = 120_000;

export interface ToolInvokeSuccess {
  id: ToolInvokeRequestId | null;
  result: ToolPreviewResponse;
  renderTimeMs: number;
  status: number;
}

export interface ToolInvokeFailure {
  code?: number;
  message: string;
  renderTimeMs: number;
  status: number | null;
  timedOut?: boolean;
}

export interface ToolInvokeState {
  run: () => Promise<void>;
  reset: () => void;
  stopWaiting: () => void;
  isLoading: boolean;
  result: ToolInvokeSuccess | null;
  error: ToolInvokeFailure | null;
  hasRun: boolean;
}

export function useToolInvoke(
  toolName: string,
  args: Record<string, unknown>,
  passthroughHeaders: Record<string, string>,
  timeoutMs: number = TOOL_INVOKE_TIMEOUT_MS,
): ToolInvokeState {
  const intl = useIntl();
  const [isLoading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolInvokeSuccess | null>(null);
  const [error, setError] = useState<ToolInvokeFailure | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<ToolInvokeRequestId | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutAbortRef = useRef(false);

  const clearRunTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancelActiveRun = useCallback((reason: string) => {
    const requestId = activeRequestIdRef.current;
    if (requestId === null) return;
    activeRequestIdRef.current = null;
    void toolsApi.cancelInvoke(requestId, reason).catch(() => undefined);
  }, []);

  const abortCurrent = useCallback(
    (cancelReason?: string) => {
      if (cancelReason) cancelActiveRun(cancelReason);
      clearRunTimer();
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [cancelActiveRun, clearRunTimer],
  );

  useEffect(() => {
    abortCurrent("tool-changed");
    setResult(null);
    setError(null);
  }, [abortCurrent, toolName]);

  useEffect(() => {
    return () => {
      abortCurrent("unmount");
    };
  }, [abortCurrent]);

  const reset = useCallback(() => {
    timeoutAbortRef.current = false;
    abortCurrent("reset");
    setResult(null);
    setError(null);
    setLoading(false);
  }, [abortCurrent]);

  const stopWaiting = useCallback(() => {
    timeoutAbortRef.current = false;
    abortCurrent("user");
    setLoading(false);
  }, [abortCurrent]);

  const run = useCallback(async () => {
    abortCurrent("superseded");
    const controller = new AbortController();
    const requestId = `tool-live-${Date.now()}`;
    abortRef.current = controller;
    activeRequestIdRef.current = requestId;
    timeoutAbortRef.current = false;

    timeoutRef.current = setTimeout(() => {
      timeoutAbortRef.current = true;
      cancelActiveRun("timeout");
      controller.abort();
    }, timeoutMs);

    setLoading(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const {
        result: invokeResult,
        status,
        id,
      } = await toolsApi.invoke(toolName, args, passthroughHeaders, {
        requestId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const renderTimeMs = Math.round(performance.now() - startedAt);
      setResult({ id, result: invokeResult, status, renderTimeMs });
    } catch (err) {
      const renderTimeMs = Math.round(performance.now() - startedAt);
      if (controller.signal.aborted && !timeoutAbortRef.current) return;
      if (timeoutAbortRef.current) {
        setError({
          message: intl.formatMessage(
            { id: "tools.details.invoke.timeout" },
            { seconds: Math.round(timeoutMs / 1000) },
          ),
          renderTimeMs,
          status: null,
          timedOut: true,
        });
        setResult(null);
        toast.error(intl.formatMessage({ id: "tools.details.invoke.error" }));
        return;
      }

      const status = err instanceof ApiError ? err.status : null;
      const code = err instanceof ToolInvokeJsonRpcError ? err.rpcError.code : undefined;
      const message =
        err instanceof ToolInvokeJsonRpcError
          ? err.message
          : parseApiError(err, err instanceof Error ? err.message : "Unknown error");
      setError({ code, message, renderTimeMs, status });
      setResult(null);
      toast.error(intl.formatMessage({ id: "tools.details.invoke.error" }));
    } finally {
      clearRunTimer();
      if (!controller.signal.aborted || timeoutAbortRef.current) {
        setLoading(false);
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
      }
      timeoutAbortRef.current = false;
    }
  }, [
    abortCurrent,
    args,
    cancelActiveRun,
    clearRunTimer,
    intl,
    passthroughHeaders,
    timeoutMs,
    toolName,
  ]);

  return {
    run,
    reset,
    stopWaiting,
    isLoading,
    result,
    error,
    hasRun: result !== null || error !== null,
  };
}
