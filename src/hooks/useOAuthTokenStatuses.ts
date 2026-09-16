import { useCallback, useEffect, useMemo, useState } from "react";

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
 * Only OAuth servers are queried: the batch does sequential token lookups, and
 * the backend rejects more than 100 ids.
 */
export function useOAuthTokenStatuses(servers: OAuthCapableServer[]) {
  const [oauthTokenStatuses, setOAuthTokenStatuses] = useState<Record<string, OAuthTokenStatus>>(
    {},
  );

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
      setOAuthTokenStatuses({});
      return;
    }
    try {
      const statuses = await serversApi.getOAuthStatus(ids);
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
      // Leaving statuses unset falls rows back to their reachability state.
      console.error("Failed to load OAuth status:", sanitizeError(err));
    }
  }, [idsKey]);

  useEffect(() => {
    void reloadOAuthStatuses();
  }, [reloadOAuthStatuses]);

  return { oauthTokenStatuses, reloadOAuthStatuses };
}
