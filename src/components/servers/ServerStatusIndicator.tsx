import { useState } from "react";
import { useIntl } from "react-intl";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  /** Use the short label, for narrow columns. */
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
  const label = intl.formatMessage({
    id: isAuthorizing
      ? "mcpServer.status.action.authorizing"
      : compact
        ? presentation.shortLabelId
        : presentation.labelId,
  });

  const content = (
    <>
      <StatusIcon
        className={cn("h-3.5 w-3.5 shrink-0", presentation.iconClassName)}
        aria-hidden="true"
        focusable="false"
      />
      <span className="text-muted-foreground">{label}</span>
    </>
  );
  const layout = "inline-flex items-center gap-1.5 text-xs";
  const trigger =
    "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!interactive) {
    return <span className={cn(layout, className)}>{content}</span>;
  }

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
        {content}
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={intl.formatMessage(
          { id: "mcpServer.status.trigger" },
          { name: server.name, status: label },
        )}
        className={cn(layout, trigger, className)}
      >
        {content}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-sm p-3">
        <ServerStatusDetail
          availability={availability}
          lastSeen={server.lastSeen}
          lastError={server.lastError}
        />
      </PopoverContent>
    </Popover>
  );
}
