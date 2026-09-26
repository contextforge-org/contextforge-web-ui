import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getOAuthStatuses,
  normalizeGatewayIds,
  type OAuthGatewayStatus,
  type OAuthStatusFailure,
  type OAuthTokenStatus,
} from "@/api/oauth";

export type OAuthStatusEntry =
  | { state: "loading" }
  | { state: "ready"; status: OAuthGatewayStatus; tokenStatus: OAuthTokenStatus }
  | { state: "not_applicable"; status: OAuthGatewayStatus }
  | { state: "unavailable"; retryable: boolean; statusCode?: number };

function unavailable(failure?: OAuthStatusFailure): OAuthStatusEntry {
  return {
    state: "unavailable",
    retryable: failure?.retryable ?? true,
    ...(failure?.status === undefined ? {} : { statusCode: failure.status }),
  };
}

function toEntry(status: OAuthGatewayStatus | undefined): OAuthStatusEntry {
  if (!status) return unavailable();
  if (status.grant_type !== "authorization_code") return { state: "not_applicable", status };
  if (!status.user_token_status || status.user_token_status.status === "unknown") {
    return unavailable();
  }
  return { state: "ready", status, tokenStatus: status.user_token_status.status };
}

/** Caller-scoped OAuth state with strict no-stale refresh semantics. */
export function useOAuthStatuses(gatewayIds: string[], { enabled = true } = {}) {
  const ids = useMemo(() => normalizeGatewayIds(gatewayIds).sort(), [gatewayIds]);
  const idsKey = ids.join(",");
  const [entries, setEntries] = useState<Record<string, OAuthStatusEntry>>({});
  const requestIdRef = useRef(0);
  const previousIdsRef = useRef<string[]>([]);
  const versionsRef = useRef(new Map<string, number>());
  const activeRequestsRef = useRef(
    new Map<number, { controller: AbortController; ids: string[] }>(),
  );
  const abortAll = useCallback(() => {
    activeRequestsRef.current.forEach(({ controller }) => controller.abort());
    activeRequestsRef.current.clear();
  }, []);

  const load = useCallback(
    async (requestedIds?: string[]) => {
      const currentIds = idsKey ? idsKey.split(",") : [];
      const currentIdSet = new Set(currentIds);
      const requested = normalizeGatewayIds(requestedIds ?? currentIds).sort();
      const targetIdSet = new Set(requested);
      if (!enabled || requested.length === 0) return;

      // An overlapping request is obsolete. If it also covered other current
      // IDs, carry those IDs into the replacement so they do not stay loading.
      activeRequestsRef.current.forEach((active, activeRequestId) => {
        if (!active.ids.some((id) => targetIdSet.has(id))) return;
        active.controller.abort();
        activeRequestsRef.current.delete(activeRequestId);
        active.ids.forEach((id) => {
          if (currentIdSet.has(id)) targetIdSet.add(id);
        });
      });
      const targetIds = [...targetIdSet].sort();
      const controller = new AbortController();
      const requestId = ++requestIdRef.current;
      activeRequestsRef.current.set(requestId, { controller, ids: targetIds });
      const versions = new Map<string, number>();
      targetIds.forEach((id) => {
        const version = (versionsRef.current.get(id) ?? 0) + 1;
        versionsRef.current.set(id, version);
        versions.set(id, version);
      });

      setEntries((current) => {
        const next = { ...current };
        targetIds.forEach((id) => {
          next[id] = { state: "loading" };
        });
        return next;
      });

      try {
        const result = await getOAuthStatuses(targetIds, controller.signal);
        if (controller.signal.aborted) return;
        setEntries((current) => {
          const next = { ...current };
          targetIds.forEach((id) => {
            if (versionsRef.current.get(id) !== versions.get(id)) return;
            next[id] = result.failures[id]
              ? unavailable(result.failures[id])
              : toEntry(result.statuses[id]);
          });
          return next;
        });
      } catch {
        if (controller.signal.aborted) return;
        setEntries((current) => {
          const next = { ...current };
          targetIds.forEach((id) => {
            if (versionsRef.current.get(id) !== versions.get(id)) return;
            next[id] = unavailable();
          });
          return next;
        });
      } finally {
        activeRequestsRef.current.delete(requestId);
      }
    },
    [enabled, idsKey],
  );

  useEffect(() => {
    const currentIds = idsKey ? idsKey.split(",") : [];
    const idSet = new Set(currentIds);
    const previousIds = previousIdsRef.current;
    const previousIdSet = new Set(previousIds);
    previousIdsRef.current = enabled ? currentIds : [];

    setEntries((current) =>
      Object.fromEntries(
        currentIds.map((id) => [id, current[id] ?? ({ state: "loading" } as const)]),
      ),
    );
    versionsRef.current.forEach((_, id) => {
      if (!idSet.has(id)) versionsRef.current.delete(id);
    });

    if (!enabled || currentIds.length === 0) {
      abortAll();
      setEntries({});
      return;
    }

    const addedIds = currentIds.filter((id) => !previousIdSet.has(id));
    void load(addedIds);
  }, [abortAll, enabled, idsKey, load]);

  useEffect(
    () => () => {
      previousIdsRef.current = [];
      abortAll();
    },
    [abortAll],
  );

  const retry = useCallback(
    (gatewayId?: string) => {
      if (gatewayId) return load([gatewayId]);
      const retryableIds = Object.entries(entries)
        .filter(([, entry]) => entry.state === "unavailable" && entry.retryable)
        .map(([id]) => id);
      return load(retryableIds);
    },
    [entries, load],
  );

  // Derive the public map from the current ID list. Unchanged IDs keep their
  // resolved state while newly added IDs render as loading before I/O starts.
  const visibleEntries = useMemo(() => {
    if (!enabled) return {};
    return Object.fromEntries(
      ids.map((id) => [id, entries[id] ?? ({ state: "loading" } as const)]),
    );
  }, [enabled, entries, ids]);

  return { entries: visibleEntries, reload: load, retry };
}
