import { useState } from "react";
import { useIntl } from "react-intl";

import {
  StatusIndicator,
  StatusIndicatorIcon,
  STATUS_INDICATOR_TRIGGER_CLASS,
} from "@/components/ui/status-indicator";
import { isRetryableOAuthStatus, type OAuthStatusEntry } from "@/api/oauth";
import {
  getAvailabilityPresentation,
  getServerAvailability,
  needsOAuthAuthorization,
  type ServerAvailabilityInput,
} from "@/lib/serverStatus";
import { cn } from "@/lib/utils";
import { ServerStatusDetail } from "./ServerStatusDetail";

interface ServerStatusIndicatorProps {
  server: ServerAvailabilityInput & { name: string; lastError?: string | null };
  oauthStatus?: OAuthStatusEntry;
  compact?: boolean;
  /** Disable popover/authorization interaction when nested inside another interactive control. */
  interactive?: boolean;
  onAuthorize?: () => Promise<void>;
  onRetry?: () => void;
  authorizationManagementHint?: boolean;
  className?: string;
}

export function ServerStatusIndicator({
  server,
  oauthStatus,
  compact = false,
  interactive = true,
  onAuthorize,
  onRetry,
  authorizationManagementHint = false,
  className,
}: ServerStatusIndicatorProps) {
  const intl = useIntl();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const availability = getServerAvailability(server, oauthStatus);
  const presentation = getAvailabilityPresentation(availability);
  const StatusIcon = presentation.Icon;
  const authorize = needsOAuthAuthorization(availability) ? onAuthorize : undefined;
  const canRetry =
    availability === "authorization_unavailable" && isRetryableOAuthStatus(oauthStatus);
  const statusLabel = intl.formatMessage({
    id: compact ? presentation.shortLabelId : presentation.labelId,
  });
  const authorizingLabel = intl.formatMessage({ id: "mcpServer.status.authorizing" });
  const label = isAuthorizing ? authorizingLabel : statusLabel;
  const fullLabel = intl.formatMessage({ id: presentation.labelId });
  const isAbbreviated = compact && presentation.shortLabelId !== presentation.labelId;

  if (interactive && authorize) {
    const runAuthorize = async () => {
      setIsAuthorizing(true);
      try {
        await authorize();
      } finally {
        setIsAuthorizing(false);
      }
    };
    return (
      <button
        type="button"
        onClick={() => void runAuthorize()}
        disabled={isAuthorizing}
        aria-label={intl.formatMessage(
          { id: "mcpServer.status.authorizeTrigger" },
          { name: server.name },
        )}
        className={cn(STATUS_INDICATOR_TRIGGER_CLASS, "disabled:opacity-70", className)}
      >
        <StatusIndicatorIcon Icon={StatusIcon} className={presentation.iconClassName} />
        <span className="grid justify-items-start text-muted-foreground">
          <span className="col-start-1 row-start-1">{label}</span>
          <span className="invisible col-start-1 row-start-1" aria-hidden="true">
            {isAuthorizing ? statusLabel : authorizingLabel}
          </span>
        </span>
      </button>
    );
  }

  return (
    <StatusIndicator
      Icon={StatusIcon}
      iconClassName={presentation.iconClassName}
      label={label}
      fullLabel={isAbbreviated ? fullLabel : undefined}
      triggerAriaLabel={intl.formatMessage(
        { id: "mcpServer.status.trigger" },
        { name: server.name, status: fullLabel },
      )}
      contentAriaLabel={intl.formatMessage(
        { id: "mcpServer.status.detail.label" },
        { name: server.name },
      )}
      className={className}
    >
      {interactive ? (
        <ServerStatusDetail
          availability={availability}
          enabled={server.enabled}
          serverName={server.name}
          lastSeen={server.lastSeen}
          lastError={server.lastError}
          onRetry={canRetry ? onRetry : undefined}
          authorizationManagementHint={authorizationManagementHint}
        />
      ) : undefined}
    </StatusIndicator>
  );
}
