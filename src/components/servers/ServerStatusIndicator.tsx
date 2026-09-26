import { useState } from "react";
import { useIntl } from "react-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const layout = "inline-flex items-center gap-1.5 text-xs";
  const trigger =
    "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const content = (
    <>
      <StatusIcon
        className={cn("h-3.5 w-3.5 shrink-0", presentation.iconClassName)}
        aria-hidden="true"
        focusable="false"
      />
      <span className="text-muted-foreground" aria-hidden={isAbbreviated || undefined}>
        {label}
      </span>
      {isAbbreviated && <span className="sr-only">{fullLabel}</span>}
    </>
  );

  if (!interactive) return <span className={cn(layout, className)}>{content}</span>;

  if (authorize) {
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
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={intl.formatMessage(
          { id: "mcpServer.status.trigger" },
          { name: server.name, status: fullLabel },
        )}
        className={cn(layout, trigger, className)}
      >
        {content}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-xs p-3">
        <ServerStatusDetail
          availability={availability}
          enabled={server.enabled}
          lastSeen={server.lastSeen}
          lastError={server.lastError}
          onRetry={canRetry ? onRetry : undefined}
          authorizationManagementHint={authorizationManagementHint}
        />
      </PopoverContent>
    </Popover>
  );
}
