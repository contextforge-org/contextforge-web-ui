import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";

import { registerCatalogServer } from "@/api/catalog";
import { ApiError } from "@/api/client";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QUICK_ADD_CATALOG_IDS } from "@/config/quickAddServers";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { cn } from "@/lib/utils";

const CATALOG_PATH = "/v1/catalog?limit=1000";
const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-4";
// Quick Add registers without collecting any credentials, so it can't complete an
// OAuth setup flow, and the gateway only supports these two transports.
const OPEN_AUTH_TYPE = "Open";
const SUPPORTED_TRANSPORTS: ReadonlySet<string> = new Set(["SSE", "STREAMABLEHTTP"]);

function isQuickAddEligible(server: CatalogServer | undefined): server is CatalogServer {
  if (!server) return false;
  return (
    server.auth_type === OPEN_AUTH_TYPE &&
    (server.transport == null || SUPPORTED_TRANSPORTS.has(server.transport))
  );
}

/**
 * DialogContent is vertically centred with a content-driven height, so anything that changes
 * height after the dialog opens re-centres the whole box and reads as a bounce. Every state
 * that precedes the loaded grid renders through here, reserving that grid's height: a card per
 * curated id, matching the real card's padding, logo box and two-line description. Children,
 * when given, are centred over the reserved space instead of the skeleton.
 */
function ReservedGridHeight({ children }: { children?: ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className={cn(GRID_CLASS, children ? "invisible" : "animate-pulse")}>
        {QUICK_ADD_CATALOG_IDS.map((id) => (
          <div key={id} className="flex flex-col rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <div className="size-8 shrink-0 rounded-md bg-muted" />
              <div className="h-5 w-full rounded bg-muted" />
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}

interface QuickAddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called once the picked entry is registered and a gateway exists for it. The caller is
   * responsible for closing the dialog.
   */
  onConnected: (gatewayId: string, serverName: string) => void;
  onBrowseCatalog: () => void;
}

export function QuickAddServerDialog({
  open,
  onOpenChange,
  onConnected,
  onBrowseCatalog,
}: QuickAddServerDialogProps) {
  const intl = useIntl();
  const groupLabelId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery<CatalogListResponse>(CATALOG_PATH, {
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setIsConnecting(false);
      setConnectError(null);
    }
  }, [open]);

  const servers = useMemo(() => {
    if (!data?.servers) return [];
    const byId = new Map(data.servers.map((server) => [server.id, server]));
    return QUICK_ADD_CATALOG_IDS.map((id) => byId.get(id)).filter(isQuickAddEligible);
  }, [data?.servers]);

  const selectedServer = servers.find((server) => server.id === selectedId) ?? null;

  const handleContinue = useCallback(async () => {
    if (!selectedServer || isConnecting) return;
    setConnectError(null);

    // Already registered, so skip the round trip and go straight to the components step.
    if (selectedServer.is_registered && selectedServer.gateway_id) {
      onConnected(selectedServer.gateway_id, selectedServer.name);
      return;
    }

    setIsConnecting(true);
    try {
      const result = await registerCatalogServer(selectedServer.id);
      if (!result.success || !result.server_id) {
        setConnectError(
          result.message || intl.formatMessage({ id: "mcpServer.quickAdd.connectError" }),
        );
        return;
      }
      onConnected(result.server_id, selectedServer.name);
    } catch (registrationError) {
      // A 409 means the catalog list this dialog loaded has gone stale, so there is no
      // gateway id to hand on. Point at the catalog rather than retrying into the same 409.
      setConnectError(
        registrationError instanceof ApiError && registrationError.status === 409
          ? intl.formatMessage(
              { id: "mcpServer.quickAdd.alreadyConnected" },
              { name: selectedServer.name },
            )
          : intl.formatMessage({ id: "mcpServer.quickAdd.connectError" }),
      );
    } finally {
      setIsConnecting(false);
    }
  }, [intl, isConnecting, onConnected, selectedServer]);

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

        {isLoading && !data && (
          <div>
            <span role="status" aria-live="polite" className="sr-only">
              {intl.formatMessage({ id: "common.loading" })}
            </span>
            <ReservedGridHeight />
          </div>
        )}

        {error && !data && (
          <ReservedGridHeight>
            <InlineNotification
              type="error"
              message={intl.formatMessage({ id: "mcpServer.quickAdd.errorState" })}
            />
          </ReservedGridHeight>
        )}

        {data && servers.length === 0 && (
          <ReservedGridHeight>
            <p className="text-sm text-muted-foreground">
              {intl.formatMessage({ id: "mcpServer.quickAdd.emptyState" })}
            </p>
          </ReservedGridHeight>
        )}

        {connectError && <InlineNotification type="error" message={connectError} />}

        {servers.length > 0 && (
          <RadioGroup
            value={selectedId ?? undefined}
            onValueChange={setSelectedId}
            disabled={isConnecting}
            aria-labelledby={groupLabelId}
            className={GRID_CLASS}
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
            <Button
              type="button"
              variant="ghost"
              disabled={isConnecting}
              onClick={() => onOpenChange(false)}
            >
              {intl.formatMessage({ id: "mcpServer.quickAdd.cancel" })}
            </Button>
            <Button
              type="button"
              disabled={!selectedServer || isConnecting}
              onClick={handleContinue}
            >
              {intl.formatMessage({
                id: isConnecting ? "mcpServer.quickAdd.connecting" : "mcpServer.quickAdd.continue",
              })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
