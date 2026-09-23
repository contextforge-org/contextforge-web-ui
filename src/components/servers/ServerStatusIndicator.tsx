import { useState } from "react";
import { useIntl } from "react-intl";

import { StatusIndicator } from "@/components/ui/status-indicator";
import type { OAuthStatusEntry } from "@/hooks/useOAuthStatuses";
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
    availability === "authorization_unavailable" &&
    oauthStatus?.state === "unavailable" &&
    oauthStatus.retryable;
  const statusLabel = intl.formatMessage({
    id: compact ? presentation.shortLabelId : presentation.labelId,
  });
  const authorizingLabel = intl.formatMessage({ id: "mcpServer.status.authorizing" });
  const label = isAuthorizing ? authorizingLabel : statusLabel;
  const fullLabel = intl.formatMessage({ id: presentation.labelId });
  const isAbbreviated = compact && presentation.shortLabelId !== presentation.labelId;

  if (interactive && authorize) {
    const layout = "inline-flex items-center gap-1.5 text-xs";
    const trigger =
      "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
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
        className={cn(layout, trigger, "disabled:opacity-70", className)}
      >
        <StatusIcon
          className={cn("h-3.5 w-3.5 shrink-0", presentation.iconClassName)}
          aria-hidden="true"
          focusable="false"
        />
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
      interactive={interactive}
      className={className}
    >
      <ServerStatusDetail
        availability={availability}
        enabled={server.enabled}
        lastSeen={server.lastSeen}
        lastError={server.lastError}
        onRetry={canRetry ? onRetry : undefined}
        authorizationManagementHint={authorizationManagementHint}
      />
    </StatusIndicator>
  );
}
