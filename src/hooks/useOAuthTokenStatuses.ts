import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { serversApi } from "@/api/servers";
import type { OAuthTokenStatus } from "@/lib/serverStatus";
import { sanitizeError } from "@/utils/errors";

interface OAuthCapableServer {
  id: string;
  authType?: string | null;
}

/**
 * The caller's own OAuth token state for the servers that have one.
 *
 * Only OAuth servers are queried, since the batch does sequential token lookups.
 */
export function useOAuthTokenStatuses(servers: OAuthCapableServer[]) {
  const [oauthTokenStatuses, setOAuthTokenStatuses] = useState<Record<string, OAuthTokenStatus>>(
    {},
  );
  const latestRequestIdRef = useRef(0);

  // Key on the ids themselves so re-fetching follows membership, not array identity.
  const idsKey = useMemo(
    () =>
      servers
        .filter((server) => server.authType === "oauth")
        .map((server) => server.id)
        .join(","),
    [servers],
  );

  const reloadOAuthStatuses = useCallback(async () => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) {
      latestRequestIdRef.current += 1;
      setOAuthTokenStatuses({});
      return;
    }
    // Concurrent lookups share state, so only the latest-issued may publish it.
    const requestId = ++latestRequestIdRef.current;
    try {
      const statuses = await serversApi.getOAuthStatus(ids);
      if (requestId !== latestRequestIdRef.current) return;
      setOAuthTokenStatuses(
        Object.fromEntries(
          Object.entries(statuses).flatMap(([id, status]) =>
            status.user_token_status
              ? [[id, status.user_token_status.status as OAuthTokenStatus]]
              : [],
          ),
        ),
      );
    } catch (err) {
      // Statuses are left as they are, so rows keep their last known state.
      console.error("Failed to load OAuth status:", sanitizeError(err));
    }
  }, [idsKey]);

  useEffect(() => {
    void reloadOAuthStatuses();
  }, [reloadOAuthStatuses]);

  return { oauthTokenStatuses, reloadOAuthStatuses };
}
