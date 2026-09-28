import { useState } from "react";
import { useIntl } from "react-intl";

import { StatusIndicator } from "@/components/ui/status-indicator";
import { cn } from "@/lib/utils";
import {
  getAvailabilityPresentation,
  getServerAvailability,
  type OAuthTokenStatus,
  type ServerAvailabilityInput,
} from "@/lib/serverStatus";
import { ServerStatusDetail } from "./ServerStatusDetail";

interface ServerStatusIndicatorProps {
  server: ServerAvailabilityInput & {
    name: string;
    lastError?: string | null;
  };
  oauthTokenStatus?: OAuthTokenStatus;
  /** Use the short label, for narrow columns. Screen readers still get the full one. */
  compact?: boolean;
  /** Render as plain text rather than a button. Required inside another button. */
  interactive?: boolean;
  /**
   * Starts the OAuth authorization flow. Given only where the caller can run
   * it; without it the `auth` state explains itself like every other state.
   */
  onAuthorize?: () => Promise<void>;
  className?: string;
}

/**
 * Server status icon and label.
 *
 * States with nothing to resolve open a popover explaining themselves, the way
 * visibility does. `auth` is the exception: it hands off to the OAuth flow
 * rather than describing it, since authorizing is the whole point of the state.
 *
 * That button stacks its two labels so the wider one sets the width, keeping
 * the row still while the flow is open.
 */
export function ServerStatusIndicator({
  server,
  oauthTokenStatus,
  compact = false,
  interactive = true,
  onAuthorize,
  className,
}: ServerStatusIndicatorProps) {
  const intl = useIntl();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const availability = getServerAvailability(server, oauthTokenStatus);
  const presentation = getAvailabilityPresentation(availability);
  const StatusIcon = presentation.Icon;
  const authorize = availability === "auth" ? onAuthorize : undefined;
  const statusLabel = intl.formatMessage({
    id: compact ? presentation.shortLabelId : presentation.labelId,
  });
  const authorizingLabel = intl.formatMessage({ id: "mcpServer.status.action.authorizing" });
  const label = isAuthorizing ? authorizingLabel : statusLabel;
  const fullLabel = intl.formatMessage({ id: presentation.labelId });
  const isAbbreviated = compact && presentation.shortLabelId !== presentation.labelId;

  if (interactive && authorize) {
    const layout = "inline-flex items-center gap-1.5 text-xs";
    const trigger =
      "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    const icon = (
      <StatusIcon
        className={cn("h-3.5 w-3.5 shrink-0", presentation.iconClassName)}
        aria-hidden="true"
        focusable="false"
      />
    );

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
        {icon}
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
      />
    </StatusIndicator>
  );
}
