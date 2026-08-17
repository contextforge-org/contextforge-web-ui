import { MoreVertical } from "lucide-react";
import { useIntl } from "react-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import type { MCPServer } from "../../types/server";

interface ServerActionsMenuProps {
  server: MCPServer;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onViewDetails?: (id: string) => void;
  onToggleEnabled?: (id: string, enabled: boolean) => void;
}

export function ServerActionsMenu({
  server,
  onEdit,
  onDelete,
  onViewDetails,
  onToggleEnabled,
}: ServerActionsMenuProps) {
  const intl = useIntl();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={intl.formatMessage(
            { id: "mcpServer.table.actions.label" },
            { name: server.name },
          )}
          aria-haspopup="menu"
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">
            {intl.formatMessage({ id: "mcpServer.table.actions.openMenu" }, { name: server.name })}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" role="menu">
        {onViewDetails && (
          <DropdownMenuItem onClick={() => onViewDetails(server.id)} role="menuitem">
            {intl.formatMessage({ id: "mcpServer.table.actions.viewDetails" })}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onEdit(server.id)} role="menuitem">
          {intl.formatMessage({ id: "mcpServer.table.actions.edit" })}
        </DropdownMenuItem>
        {onToggleEnabled && (
          <DropdownMenuItem
            onClick={() => onToggleEnabled(server.id, !server.enabled)}
            role="menuitem"
          >
            {intl.formatMessage({
              id: server.enabled
                ? "mcpServer.table.actions.deactivate"
                : "mcpServer.table.actions.activate",
            })}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => onDelete(server.id)}
          className="text-red-600 dark:text-red-400"
          role="menuitem"
        >
          {intl.formatMessage({ id: "mcpServer.table.actions.delete" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
