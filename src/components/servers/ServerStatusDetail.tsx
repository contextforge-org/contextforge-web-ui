import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import type { ServerAvailability } from "@/lib/serverStatus";
import { getAvailabilityPresentation, needsOAuthAuthorization } from "@/lib/serverStatus";
import { formatLocalDateTime } from "@/utils/formatDate";

export function ServerStatusDetail({
  availability,
  enabled,
  lastSeen,
  lastError,
  onRetry,
  authorizationManagementHint = false,
}: {
  availability: ServerAvailability;
  enabled: boolean;
  lastSeen?: string | null;
  lastError?: string | null;
  onRetry?: () => void;
  authorizationManagementHint?: boolean;
}) {
  const intl = useIntl();
  const presentation = getAvailabilityPresentation(availability);
  const showLastError = Boolean(lastError) && enabled;

  return (
    <div className="space-y-2 text-sm">
      <p className="text-foreground">{intl.formatMessage({ id: presentation.detailId })}</p>
      {authorizationManagementHint && needsOAuthAuthorization(availability) && (
        <p className="text-muted-foreground">
          {intl.formatMessage({ id: "mcpServer.status.detail.manageAuthorization" })}
        </p>
      )}
      {lastSeen && (
        <p className="text-xs text-muted-foreground">
          {intl.formatMessage(
            { id: "mcpServer.status.detail.lastSeen" },
            { timestamp: formatLocalDateTime(lastSeen, lastSeen) },
          )}
        </p>
      )}
      {showLastError && (
        <p className="break-words text-muted-foreground">
          {intl.formatMessage({ id: "mcpServer.status.detail.lastError" }, { error: lastError })}
        </p>
      )}
      {onRetry && (
        <Button type="button" variant="outline" size="xs" onClick={onRetry}>
          {intl.formatMessage({ id: "mcpServer.status.retry" })}
        </Button>
      )}
    </div>
  );
}
