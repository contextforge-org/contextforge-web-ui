import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";

import { MCPIcon } from "@/components/icons/MCPIcon";
import { CatalogLogo } from "@/components/server-catalog/CatalogLogo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Loading } from "@/components/ui/loading";
import { QUICK_ADD_CATALOG_IDS } from "@/config/quickAddServers";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";

const CATALOG_PATH = "/v1/catalog?limit=1000";

interface QuickAddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the picked catalog entry. The caller is responsible for closing the dialog. */
  onSelect: (server: CatalogServer) => void;
  onBrowseCatalog: () => void;
}

export function QuickAddServerDialog({
  open,
  onOpenChange,
  onSelect,
  onBrowseCatalog,
}: QuickAddServerDialogProps) {
  const intl = useIntl();
  const groupLabelId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery<CatalogListResponse>(CATALOG_PATH, {
    enabled: open,
  });

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  const servers = useMemo(() => {
    if (!data?.servers) return [];
    const byId = new Map(data.servers.map((server) => [server.id, server]));
    return QUICK_ADD_CATALOG_IDS.map((id) => byId.get(id)).filter(
      (server): server is CatalogServer => Boolean(server),
    );
  }, [data?.servers]);

  const selectedServer = servers.find((server) => server.id === selectedId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-orange-500 text-neutral-950 shadow-sm">
              <MCPIcon className="h-4 w-4" />
            </div>
            <DialogTitle>
              {intl.formatMessage({ id: "mcpServer.quickAdd.dialogTitle" })}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {intl.formatMessage({ id: "mcpServer.quickAdd.dialogDescription" })}
          </DialogDescription>
        </DialogHeader>

        {isLoading && !data && <Loading variant="inline" />}

        {error && !data && (
          <InlineNotification
            type="error"
            message={intl.formatMessage({ id: "mcpServer.quickAdd.errorState" })}
          />
        )}

        {data && servers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {intl.formatMessage({ id: "mcpServer.quickAdd.emptyState" })}
          </p>
        )}

        {servers.length > 0 && (
          <div
            role="radiogroup"
            aria-labelledby={groupLabelId}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <span id={groupLabelId} className="sr-only">
              {intl.formatMessage({ id: "mcpServer.quickAdd.radioGroupLabel" })}
            </span>
            {servers.map((server) => {
              const inputId = `quick-add-${server.id}`;
              return (
                <div key={server.id}>
                  <input
                    type="radio"
                    id={inputId}
                    name="quick-add-server"
                    value={server.id}
                    checked={selectedId === server.id}
                    onChange={() => setSelectedId(server.id)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={inputId}
                    className="flex h-full cursor-pointer flex-col rounded-xl border border-border p-3 transition-colors hover:border-ring peer-checked:border-ring peer-checked:ring-1 peer-checked:ring-ring peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 dark:hover:border-muted-foreground"
                  >
                    <div className="flex items-center gap-2">
                      <CatalogLogo server={server} />
                      <span className="truncate text-sm font-semibold text-foreground">
                        {server.name}
                      </span>
                    </div>
                    <span className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {server.description}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {intl.formatMessage(
              { id: "mcpServer.quickAdd.footerText" },
              {
                catalog: (chunks: ReactNode) => (
                  <Button
                    type="button"
                    variant="link"
                    onClick={onBrowseCatalog}
                    className="inline h-auto p-0 font-medium text-cyan-700 decoration-cyan-300 underline-offset-4 transition hover:text-cyan-800 dark:text-cyan-400 dark:decoration-cyan-700 dark:hover:text-cyan-300"
                  >
                    {chunks}
                  </Button>
                ),
              },
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {intl.formatMessage({ id: "mcpServer.quickAdd.cancel" })}
            </Button>
            <Button
              type="button"
              disabled={!selectedServer}
              onClick={() => {
                if (selectedServer) onSelect(selectedServer);
              }}
            >
              {intl.formatMessage({ id: "mcpServer.quickAdd.continue" })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
