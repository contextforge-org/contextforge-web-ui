import { useIntl } from "react-intl";

import { getAvailabilityPresentation, type ServerAvailability } from "@/lib/serverStatus";
import { formatLocalDateTime } from "@/utils/formatDate";

interface ServerStatusDetailProps {
  availability: ServerAvailability;
  enabled: boolean;
  lastSeen?: string | null;
  lastError?: string | null;
}

/**
 * What a status means, plus the last response and last error where the server
 * has them. This is the only place either value is surfaced in the UI.
 *
 * Disabled servers withhold the error: the health loop clears `last_error` only
 * on enabled servers, so theirs is left over from an outage before they were
 * turned off and reads as a current failure. The test is `enabled` rather than
 * the `inactive` state, because `auth` outranks `inactive`, so a disabled
 * server whose token has also expired is classified `auth` and would otherwise
 * slip past the guard.
 */
export function ServerStatusDetail({
  availability,
  enabled,
  lastSeen,
  lastError,
}: ServerStatusDetailProps) {
  const intl = useIntl();
  const showLastError = Boolean(lastError) && enabled;

  return (
    <div className="space-y-2 text-sm">
      <p className="text-foreground">
        {intl.formatMessage({ id: getAvailabilityPresentation(availability).detailId })}
      </p>
      {lastSeen && (
        <p className="text-muted-foreground">
          {intl.formatMessage(
            { id: "mcpServer.status.detail.lastSeen" },
            { timestamp: formatLocalDateTime(lastSeen, "") },
          )}
        </p>
      )}
      {showLastError && (
        <p className="break-words text-muted-foreground">
          {intl.formatMessage({ id: "mcpServer.status.detail.lastError" }, { error: lastError })}
        </p>
      )}
    </div>
  );
}
