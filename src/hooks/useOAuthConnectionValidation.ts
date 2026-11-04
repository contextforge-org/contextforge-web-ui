import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/api/client";
import { serversApi } from "@/api/servers";
import type { OAuthConnectionValidationResponse } from "@/api/contracts/oauthConnectionValidation";
import {
  hasValidationStages,
  validationSucceeded,
  VALIDATION_STAGES,
} from "@/lib/oauthConnectionValidation";

export interface OAuthConnectionValidationState {
  state: "running" | "success" | "failure";
  result?: OAuthConnectionValidationResponse;
  errorCode?: string;
  testedAt?: number;
}

type Target = { gatewayId: string; baseUrl: string };

export function useOAuthConnectionValidation(enabled = true, targets?: Record<string, string>) {
  const [entries, setEntries] = useState<Record<string, OAuthConnectionValidationState>>({});
  const requests = useRef(new Map<string, AbortController>());

  const reset = useCallback((id: string) => {
    requests.current.get(id)?.abort();
    requests.current.delete(id);
    setEntries((previous) => {
      if (!previous[id]) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  const previousTargets = useRef<Record<string, string>>({});
  const targetsKey = JSON.stringify(targets);
  useEffect(() => {
    if (!targetsKey) return;
    const current = JSON.parse(targetsKey) as Record<string, string>;
    Object.entries(previousTargets.current).forEach(([id, key]) => {
      if (current[id] !== key) reset(id);
    });
    previousTargets.current = current;
  }, [targetsKey, reset]);

  const abortAll = useCallback(() => {
    requests.current.forEach((controller) => controller.abort());
    requests.current.clear();
  }, []);

  useEffect(() => abortAll, [abortAll]);
  useEffect(() => {
    if (!enabled) {
      abortAll();
      setEntries({});
    }
  }, [enabled, abortAll]);

  const test = useCallback(
    async (id: string, target: Target | ((signal: AbortSignal) => Promise<Target>)) => {
      if (!enabled || requests.current.has(id)) return;
      const controller = new AbortController();
      requests.current.set(id, controller);
      const isCurrent = () => !controller.signal.aborted && requests.current.get(id) === controller;
      setEntries((previous) => ({ ...previous, [id]: { ...previous[id], state: "running" } }));
      let resolvingTarget = true;
      try {
        const resolved = typeof target === "function" ? await target(controller.signal) : target;
        if (!isCurrent()) return;
        if (resolved.gatewayId !== id) throw new ApiError(422, null, "Gateway mismatch");
        resolvingTarget = false;
        const result = await serversApi.testOAuthConnection(resolved, controller.signal);
        if (!isCurrent()) return;
        const incompleteStage = VALIDATION_STAGES.find((stage) => result?.stages?.[stage] !== "ok");
        const stageErrorCode = incompleteStage
          ? {
              token: "token_validation_failed",
              negotiation: "mcp_handshake_failed",
              tools_list:
                result?.stages?.tools_list === "unsupported"
                  ? "tools_unsupported"
                  : "tools_list_failed",
            }[incompleteStage]
          : undefined;
        setEntries((previous) => ({
          ...previous,
          [id]: {
            state: validationSucceeded(result) ? "success" : "failure",
            result,
            errorCode: hasValidationStages(result)
              ? result?.errorCode || stageErrorCode
              : "incompatible",
            testedAt: Date.now(),
          },
        }));
      } catch (error) {
        if (!isCurrent()) return;
        const errorCode =
          error instanceof ApiError
            ? ((
                {
                  401: "unauthenticated",
                  403: "permission_denied",
                  422: "request_invalid",
                  429: "rate_limited",
                  404: "gateway_unavailable",
                } as Record<number, string>
              )[error.status] ?? "generic")
            : resolvingTarget
              ? "gateway_unavailable"
              : "network";
        setEntries((previous) => ({
          ...previous,
          [id]: { state: "failure", errorCode, testedAt: Date.now() },
        }));
      } finally {
        if (requests.current.get(id) === controller) requests.current.delete(id);
      }
    },
    [enabled],
  );

  return { entries, test, reset };
}
