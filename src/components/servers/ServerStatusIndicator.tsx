import { useState } from "react";
import { useIntl } from "react-intl";

import { cn } from "@/lib/utils";
import {
  getAvailabilityPresentation,
  getServerAvailability,
  type OAuthTokenStatus,
  type ServerAvailabilityInput,
} from "@/lib/serverStatus";
import { ServerStatusDialog } from "./ServerStatusDialog";

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
  onAuthorize?: () => Promise<void>;
  onEnable?: () => Promise<void>;
  className?: string;
}

/** Server status icon and label, opening the detail dialog on click. */
export function ServerStatusIndicator({
  server,
  oauthTokenStatus,
  compact = false,
  interactive = true,
  onAuthorize,
  onEnable,
  className,
}: ServerStatusIndicatorProps) {
  const intl = useIntl();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const availability = getServerAvailability(server, oauthTokenStatus);
  const presentation = getAvailabilityPresentation(availability);
  const StatusIcon = presentation.Icon;
  const label = intl.formatMessage({
    id: compact ? presentation.shortLabelId : presentation.labelId,
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

  if (!interactive) {
    return <span className={cn(layout, className)}>{content}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsDialogOpen(true)}
        aria-label={intl.formatMessage(
          { id: "mcpServer.status.trigger" },
          { name: server.name, status: label },
        )}
        className={cn(
          layout,
          "rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {content}
      </button>
      <ServerStatusDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        serverName={server.name}
        availability={availability}
        lastSeen={server.lastSeen}
        lastError={server.lastError}
        onAuthorize={onAuthorize}
        onEnable={onEnable}
      />
    </>
  );
}
