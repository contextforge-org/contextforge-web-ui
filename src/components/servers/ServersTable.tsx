import { Building2, Lock, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { useIntl } from "react-intl";
import { ServerIcon } from "./ServerIcon";
import { ServerActionsMenu } from "./ServerActionsMenu";
import type { MCPServer } from "../../types/server";
import { Loading } from "../ui/loading";
import { formatLocalDateTime } from "../../utils/formatDate";
import { CopyButton } from "@/components/ui/copy-button";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { OAuthStatusEntry } from "@/hooks/useOAuthStatuses";
import { ServerStatusIndicator } from "./ServerStatusIndicator";

function getLastSeenValue(server: MCPServer): string | undefined {
  return server.lastSeen;
}

function getToolCount(server: MCPServer): number {
  return server.toolCount ?? 0;
}

function getResourceCount(server: MCPServer): number {
  return server.resourceCount ?? 0;
}

function getPromptCount(server: MCPServer): number {
  return server.promptCount ?? 0;
}

function getVisibilityConfig(visibility: MCPServer["visibility"]) {
  switch (visibility) {
    case "private":
      return { labelId: "common.visibility.private", Icon: Lock };
    case "team":
      return { labelId: "common.visibility.team", Icon: Users };
    default:
      return { labelId: "common.visibility.internal", Icon: Building2 };
  }
}

interface ServersTableProps {
  servers: MCPServer[];
  isLoading: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  onToggleEnabled?: (id: string, enabled: boolean) => void;
  onRefresh?: (id: string) => void;
  refreshingServerIds?: Set<string>;
  oauthStatuses?: Record<string, OAuthStatusEntry>;
  onAuthorize?: (id: string) => Promise<void>;
  onRetryOAuthStatus?: (id: string) => void;
}

export function ServersTable({
  servers,
  isLoading,
  onEdit,
  onDelete,
  onViewDetails,
  onToggleEnabled,
  onRefresh,
  refreshingServerIds,
  oauthStatuses,
  onAuthorize,
  onRetryOAuthStatus,
}: ServersTableProps) {
  const intl = useIntl();

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loading />
        <span className="sr-only">{intl.formatMessage({ id: "mcpServer.loading" })}</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <Table className="min-w-full border-separate border-spacing-y-1.5">
        <TableCaption className="sr-only">
          {intl.formatMessage({ id: "mcpServer.table.caption" })}
        </TableCaption>
        <TableHeader className="bg-main">
          <TableRow className="border-none hover:bg-transparent">
            <TableHead className="border-b border-border h-12 px-4 text-xs font-medium">
              {intl.formatMessage({ id: "mcpServer.table.name" })}
            </TableHead>
            <TableHead className="border-b border-border h-12 px-4 text-xs font-medium">
              {intl.formatMessage({ id: "mcpServer.table.components" })}
            </TableHead>
            <TableHead className="border-b border-border h-12 px-4 text-xs font-medium">
              {intl.formatMessage({ id: "mcpServer.table.lastResponse" })}
            </TableHead>
            <TableHead className="border-b border-border h-12 px-4 text-xs font-medium">
              {intl.formatMessage({ id: "mcpServer.table.uuid" })}
            </TableHead>
            <TableHead className="border-b border-border h-12 px-4 text-xs font-medium">
              {intl.formatMessage({ id: "mcpServer.table.visibility" })}
            </TableHead>
            <TableHead className="border-b border-border h-12 px-4 text-xs font-medium">
              {intl.formatMessage({ id: "mcpServer.table.status" })}
            </TableHead>
            <TableHead className="border-b border-border h-12 px-4 text-xs font-medium text-right">
              {intl.formatMessage({ id: "mcpServer.table.actions" })}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {servers.map((server) => {
            const resourcesCount = getResourceCount(server);
            const promptsCount = getPromptCount(server);
            const toolCount = getToolCount(server);
            const lastSeen = getLastSeenValue(server);
            const visibility = getVisibilityConfig(server.visibility);
            const VisibilityIcon = visibility.Icon;

            return (
              <TableRow
                key={server.id}
                className="border-0 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700/60 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
              >
                <TableCell className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <ServerIcon name={server.name} size="md" />
                    <span className="font-medium text-card-foreground">{server.name}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {intl.formatMessage(
                        { id: "mcpServer.table.components.tools" },
                        { count: toolCount },
                      )}
                    </span>
                    <span>•</span>
                    <span>
                      {intl.formatMessage(
                        { id: "mcpServer.table.components.resources" },
                        { count: resourcesCount },
                      )}
                    </span>
                    <span>•</span>
                    <span>
                      {intl.formatMessage(
                        { id: "mcpServer.table.components.prompts" },
                        { count: promptsCount },
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2.5 text-xs text-muted-foreground">
                  {formatLocalDateTime(lastSeen, intl.formatMessage({ id: "mcpServer.neverUsed" }))}
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <TruncatedText className="max-w-[180px]">{server.id}</TruncatedText>
                    <CopyButton
                      value={server.id}
                      label={intl.formatMessage(
                        { id: "mcpServer.table.copyUuid" },
                        { name: server.name },
                      )}
                      iconClassName="h-3.5 w-3.5"
                    />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <VisibilityIcon className="h-3.5 w-3.5" aria-hidden="true" focusable="false" />
                    <span>{intl.formatMessage({ id: visibility.labelId })}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-2.5">
                  <ServerStatusIndicator
                    server={server}
                    oauthStatus={oauthStatuses?.[server.id]}
                    onAuthorize={onAuthorize && (() => onAuthorize(server.id))}
                    onRetry={onRetryOAuthStatus && (() => onRetryOAuthStatus(server.id))}
                    compact
                  />
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right">
                  <ServerActionsMenu
                    server={server}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onViewDetails={onViewDetails}
                    onToggleEnabled={onToggleEnabled}
                    onRefresh={onRefresh}
                    isRefreshing={refreshingServerIds?.has(server.id)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
