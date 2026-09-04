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
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/ui/loading";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QUICK_ADD_CATALOG_IDS } from "@/config/quickAddServers";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";

const CATALOG_PATH = "/v1/catalog?limit=1000";
// Quick Add submits through the standard gateway-create form, which can't yet
// complete an OAuth setup flow, and only supports these two transports.
const OPEN_AUTH_TYPE = "Open";
const SUPPORTED_TRANSPORTS: ReadonlySet<string> = new Set(["SSE", "STREAMABLEHTTP"]);

function isQuickAddEligible(server: CatalogServer | undefined): server is CatalogServer {
  if (!server) return false;
  return (
    server.auth_type === OPEN_AUTH_TYPE &&
    (server.transport == null || SUPPORTED_TRANSPORTS.has(server.transport))
  );
}

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
    return QUICK_ADD_CATALOG_IDS.map((id) => byId.get(id)).filter(isQuickAddEligible);
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
          <RadioGroup
            value={selectedId ?? undefined}
            onValueChange={setSelectedId}
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
                  <RadioGroupItem id={inputId} value={server.id} className="peer sr-only" />
                  <Label
                    htmlFor={inputId}
                    className="flex h-full cursor-pointer flex-col rounded-xl border border-border p-3 font-normal transition-colors hover:border-ring peer-data-[state=checked]:border-ring peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-ring peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 dark:hover:border-muted-foreground"
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
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
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
