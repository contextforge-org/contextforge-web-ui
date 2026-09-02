import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useIntl } from "react-intl";

import { registerCatalogServer } from "@/api/catalog";
import { ApiError } from "@/api/client";
import { TeamSelect } from "@/components/common/TeamSelect";
import { VisibilityInfoPopover } from "@/components/common/VisibilityInfoPopover";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QUICK_ADD_CATALOG_IDS } from "@/config/quickAddServers";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useQuery } from "@/hooks/useQuery";
import { useTeamScope } from "@/hooks/useTeams";
import { cn } from "@/lib/utils";
import type { Visibility } from "@/types/server";

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

export interface QuickAddConnection {
  gatewayId: string;
  serverName: string;
  visibility: Visibility;
  teamId: string;
}

interface QuickAddServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called once the picked entry is registered and a gateway exists for it. The caller is
   * responsible for closing the dialog, and for carrying the chosen scope into the components
   * step so the virtual server lands where the user asked for it.
   */
  onConnected: (connection: QuickAddConnection) => void;
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
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [teamId, setTeamId] = useState("");
  const [teamError, setTeamError] = useState<string>();
  // Curated ids the backend 404s on. The list comes from the query cache rather than local
  // state, so entries are dropped here instead of being spliced out of the cached response.
  const [unavailableIds, setUnavailableIds] = useState<ReadonlySet<string>>(new Set());
  const { teams, onTeamChange } = useTeamScope({ visibility, teamId, onTeamIdChange: setTeamId });

  const { data, error, isLoading } = useQuery<CatalogListResponse>(CATALOG_PATH, {
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setIsConnecting(false);
      setConnectError(null);
      setVisibility("private");
      setTeamId("");
      setTeamError(undefined);
      setUnavailableIds(new Set());
    }
  }, [open]);

  const servers = useMemo(() => {
    if (!data?.servers) return [];
    const byId = new Map(data.servers.map((server) => [server.id, server]));
    return QUICK_ADD_CATALOG_IDS.filter((id) => !unavailableIds.has(id))
      .map((id) => byId.get(id))
      .filter(isQuickAddEligible);
  }, [data?.servers, unavailableIds]);

  const selectedServer = servers.find((server) => server.id === selectedId) ?? null;
  const isLoadingCatalog = isLoading && !data;
  // Rendered while loading as well as when loaded, so the dialog does not grow by this field's
  // height the moment the grid arrives. ReservedGridHeight covers the grid; this covers itself.
  // The error and empty states keep it hidden: there is nothing there to scope.
  const showScopeFields = isLoadingCatalog || servers.length > 0;

  const handleContinue = useCallback(async () => {
    if (!selectedServer || isConnecting) return;
    setConnectError(null);

    if (visibility === "team" && !teamId) {
      setTeamError(intl.formatMessage({ id: "mcpServer.quickAdd.teamRequired" }));
      return;
    }
    setTeamError(undefined);

    const scope = { visibility, teamId: visibility === "team" ? teamId : "" };

    // Already registered, so skip the round trip and go straight to the components step. The
    // scope reaches the virtual server built there; the existing gateway keeps its own.
    if (selectedServer.is_registered && selectedServer.gateway_id) {
      onConnected({
        gatewayId: selectedServer.gateway_id,
        serverName: selectedServer.name,
        ...scope,
      });
      return;
    }

    setIsConnecting(true);
    try {
      const result = await registerCatalogServer(selectedServer.id, {
        visibility,
        team_id: scope.teamId || null,
      });
      if (!result.success || !result.server_id) {
        setConnectError(
          result.message || intl.formatMessage({ id: "mcpServer.quickAdd.connectError" }),
        );
        return;
      }
      onConnected({ gatewayId: result.server_id, serverName: selectedServer.name, ...scope });
    } catch (registrationError) {
      // A 409 means the catalog list this dialog loaded has gone stale, so there is no
      // gateway id to hand on. Point at the catalog rather than retrying into the same 409.
      if (registrationError instanceof ApiError && registrationError.status === 409) {
        setConnectError(
          intl.formatMessage(
            { id: "mcpServer.quickAdd.alreadyConnected" },
            { name: selectedServer.name },
          ),
        );
        return;
      }

      // A 404 means the entry left the catalog, so drop it rather than leave a card that
      // 404s again on every retry.
      if (registrationError instanceof ApiError && registrationError.status === 404) {
        setUnavailableIds((current) => new Set(current).add(selectedServer.id));
        setSelectedId(null);
        setConnectError(
          intl.formatMessage({ id: "mcpServer.quickAdd.notFound" }, { name: selectedServer.name }),
        );
        return;
      }

      setConnectError(intl.formatMessage({ id: "mcpServer.quickAdd.connectError" }));
    } finally {
      setIsConnecting(false);
    }
  }, [intl, isConnecting, onConnected, selectedServer, teamId, visibility]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      // Nothing cancels an in-flight registration, so a dismissal here would still land the
      // user on the components step once it resolved. Hold the dialog until it settles.
      if (!nextOpen && isConnecting) return;
      onOpenChange(nextOpen);
    },
    [isConnecting, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

        {isLoadingCatalog && (
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

        {showScopeFields && (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="quick-add-visibility">
                  {intl.formatMessage({ id: "gateways.createServer.visibility" })}
                </Label>
                <VisibilityInfoPopover />
              </div>
              <Select
                value={visibility}
                onValueChange={(value: Visibility) => {
                  setVisibility(value);
                  setTeamError(undefined);
                }}
                disabled={isConnecting || isLoadingCatalog}
              >
                {/* SelectTrigger is w-fit by default; full width lines it up with the grid. */}
                <SelectTrigger id="quick-add-visibility" className="w-full">
                  <SelectValue
                    placeholder={intl.formatMessage({
                      id: "mcpServer.advanced.visibilityPlaceholder",
                    })}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    {intl.formatMessage({ id: "common.visibility.private" })}
                  </SelectItem>
                  <SelectItem value="team">
                    {intl.formatMessage({ id: "common.visibility.team" })}
                  </SelectItem>
                  {/* The API uses "public" for org-internal visibility; the UI label is "Internal". */}
                  <SelectItem value="public">
                    {intl.formatMessage({ id: "common.visibility.internal" })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {visibility === "team" && (
              <TeamSelect
                id="quick-add-team"
                teams={teams}
                value={teamId || undefined}
                onChange={onTeamChange}
                error={teamError}
              />
            )}
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
                    disabled={isConnecting}
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
              onClick={() => handleOpenChange(false)}
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
