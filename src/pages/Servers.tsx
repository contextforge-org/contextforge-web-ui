import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { MCPIcon } from "@/components/icons/MCPIcon";
import { Button } from "@/components/ui/button";
import { MCPServerForm } from "@/components/mcp-servers/MCPServerForm";
import { ServersTable } from "@/components/servers/ServersTable";
import { ListSearch } from "@/components/ui/list-search";
import { ConfirmDialog } from "@/components/servers/ConfirmDialog";
import { MCPServerDetailsPanel } from "@/components/servers/MCPServerDetailsPanel";
import { useAuth } from "@/auth/useAuth";
import { useQuery } from "@/hooks/useQuery";
import { useLocalSearch } from "@/hooks/useLocalSearch";
import { ApiError, api } from "@/api/client";
import { OAuthAuthorizationError, OAuthCancelledError, serversApi } from "@/api/servers";
import { useRouter } from "@/router";
import { extractApiErrorDetail, sanitizeError } from "@/utils/errors";
import type { MCPServer, ServersResponse } from "@/types/server";
import { Loading } from "@/components/ui/loading";
import { InlineNotification } from "@/components/ui/inline-notification";
import { useIntl } from "react-intl";
import type { OAuthAttempt } from "@/api/oauth";
import { useOAuthStatuses } from "@/hooks/useOAuthStatuses";
import { isOAuthServer } from "@/lib/serverStatus";

// Pagination constants
const DEFAULT_PAGE_SIZE = 10;

function oauthFailureReason(error: unknown): string {
  return error instanceof OAuthAuthorizationError ? error.message : sanitizeError(error);
}

export function Servers() {
  const intl = useIntl();
  const { path } = useRouter();
  const { hasPermission, permissionsLoading } = useAuth();
  const canCreateServer = !permissionsLoading && hasPermission("gateways.create");
  const canUpdateServer = !permissionsLoading && hasPermission("gateways.update");
  const canDeleteServer = !permissionsLoading && hasPermission("gateways.delete");
  const canReadServers = !permissionsLoading && hasPermission("gateways.read");
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [allServers, setAllServers] = useState<MCPServer[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [updateServerId, setUpdateServerId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [refreshingServerIds, setRefreshingServerIds] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedServerIdForDetails, setSelectedServerIdForDetails] = useState<string | null>(null);
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false);
  const [detailsInitialTab, setDetailsInitialTab] = useState<"tryit" | "components">("tryit");
  const [oauthAttempts, setOAuthAttempts] = useState<Record<string, OAuthAttempt>>({});
  const pendingAuthorizationIds = useRef(new Set<string>());
  const pendingRefreshIds = useRef(new Set<string>());
  const refreshKinds = useRef(new Map<string, "oauth" | "manual">());
  const [componentRevisions, setComponentRevisions] = useState<Record<string, number>>({});
  const [componentRefreshErrors, setComponentRefreshErrors] = useState<
    Record<string, { reason?: string } | undefined>
  >({});
  const selectedSearchServerId = useMemo(() => {
    const queryString = path.split("?")[1] ?? "";
    return new URLSearchParams(queryString).get("selected")?.trim() || null;
  }, [path]);

  // Keep the primary list in sync with the selected page size
  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", limit.toString());
    params.set("include_pagination", "true");
    params.set("include_inactive", "true");
    return `/v1/mcp-servers?${params.toString()}`;
  }, [limit]);

  // Use useQuery hook for initial data fetching and limit changes
  const {
    data: response,
    error: queryError,
    isLoading,
    refetch,
    setData: setQueryData,
  } = useQuery<ServersResponse>(queryPath);

  // Fetch server details when selectedServerIdForDetails changes
  const detailsQueryPath = useMemo(
    () =>
      selectedServerIdForDetails
        ? `/v1/mcp-servers/${encodeURIComponent(selectedServerIdForDetails)}`
        : "/v1/mcp-servers/_placeholder_",
    [selectedServerIdForDetails],
  );

  const {
    data: detailsServer,
    error: detailsQueryError,
    setData: setDetailsServer,
  } = useQuery<MCPServer>(detailsQueryPath, {
    enabled: Boolean(selectedServerIdForDetails),
  });

  const detailsError = detailsQueryError ? { message: detailsQueryError.message } : null;

  // Seed the panel from the listing row so the chrome renders instantly;
  // detailsServer silently replaces the seed once the detail fetch resolves.
  const selectedRow = useMemo(
    () => allServers.find((s) => s.id === selectedServerIdForDetails) ?? null,
    [allServers, selectedServerIdForDetails],
  );
  const panelServer =
    detailsServer?.id === selectedServerIdForDetails ? detailsServer : selectedRow;
  const panelAttempt = panelServer ? oauthAttempts[panelServer.id] : undefined;

  // Update servers on initial load
  useEffect(() => {
    if (response) {
      setAllServers(response.gateways);
      setNextCursor(response.nextCursor ?? null);
    }
  }, [response]);

  // Derive servers from accumulated list
  const servers = allServers;
  const oauthServerIds = useMemo(
    () => [
      ...new Set([
        ...servers.filter(isOAuthServer).map((server) => server.id),
        ...(panelServer && isOAuthServer(panelServer) ? [panelServer.id] : []),
      ]),
    ],
    [servers, panelServer],
  );
  const {
    entries: oauthStatuses,
    reload: reloadOAuthStatuses,
    retry: retryOAuthStatus,
  } = useOAuthStatuses(oauthServerIds, { enabled: canReadServers });

  const getServerText = useCallback(
    (server: MCPServer) => `${server.name} ${server.description ?? ""} ${server.id}`,
    [],
  );
  const { query, setQuery, results: filteredServers } = useLocalSearch(servers, getServerText);

  // Convert query error to string for display
  const error = queryError ? queryError.message : null;

  // Patch a single server into local state (and the query cache) instead of
  // refetching the whole list: a refetch() remounts the table behind the
  // page-level isLoading spinner, which reads as flicker. Same approach as
  // Tools.tsx handleToggleTool.
  const patchServer = useCallback(
    (updated: MCPServer) => {
      setAllServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      // Keep the query cache aligned so the refetch useEffect doesn't restore
      // the pre-mutation row.
      setQueryData((prev) =>
        prev
          ? { ...prev, gateways: prev.gateways.map((s) => (s.id === updated.id ? updated : s)) }
          : prev,
      );
    },
    [setQueryData],
  );

  const handleEdit = (id: string) => {
    setUpdateServerId(id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setSelectedServerId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = useCallback(async () => {
    if (!selectedServerId) return;

    const idToDelete = selectedServerId;
    const previousServers = allServers;
    const serverToDelete = allServers.find((s) => s.id === idToDelete);

    const filtered = allServers.filter((s) => s.id !== idToDelete);
    setAllServers(filtered);
    // Keep the query cache aligned so the refetch useEffect doesn't restore the deleted server.
    setQueryData((prev) =>
      prev ? { ...prev, gateways: prev.gateways.filter((s) => s.id !== idToDelete) } : prev,
    );

    const previousServerIdForDetails = selectedServerIdForDetails;
    const previousDrawerOpen = isDetailsDrawerOpen;

    if (selectedServerIdForDetails === idToDelete) {
      setIsDetailsDrawerOpen(false);
      setSelectedServerIdForDetails(null);
    }
    setDeleteDialogOpen(false);
    setSelectedServerId(null);

    try {
      await serversApi.delete(idToDelete);
      toast.success(
        intl.formatMessage(
          { id: "mcpServer.delete.success" },
          { name: serverToDelete?.name ?? idToDelete },
        ),
      );
      try {
        await refetch();
      } catch (refreshErr) {
        const errorMsg = sanitizeError(refreshErr);
        console.error("Failed to refresh servers after deletion:", errorMsg);
      }
    } catch (err) {
      setAllServers(previousServers);
      setQueryData((prev) => (prev ? { ...prev, gateways: previousServers } : prev));
      setSelectedServerIdForDetails(previousServerIdForDetails);
      setIsDetailsDrawerOpen(previousDrawerOpen);
      const errorMsg = sanitizeError(err);
      toast.error(intl.formatMessage({ id: "mcpServer.delete.errorTitle" }), {
        description: errorMsg,
      });
      console.error("Failed to delete server:", errorMsg);
    }
  }, [
    allServers,
    selectedServerId,
    selectedServerIdForDetails,
    isDetailsDrawerOpen,
    refetch,
    setQueryData,
    intl,
  ]);

  const handleToggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      setToggleError(null);
      try {
        await serversApi.toggleEnabled(id, enabled);
        try {
          // Refresh only the toggled server and patch it into the list, instead
          // of refetching the whole page (which remounts the table and flickers).
          serversApi.invalidateGetCache(id);
          const updated = await serversApi.get(id);
          patchServer(updated);
        } catch (refreshErr) {
          console.error("Failed to refresh server after toggle:", sanitizeError(refreshErr));
        }
      } catch (err) {
        const errorMsg = sanitizeError(err);
        setToggleError(errorMsg);
        console.error("Failed to toggle server state:", errorMsg);
      }
    },
    [patchServer],
  );

  const discoverOAuthComponents = useCallback(
    async (id: string) => {
      if (!canUpdateServer || pendingRefreshIds.current.has(id)) return;
      pendingRefreshIds.current.add(id);
      refreshKinds.current.set(id, "oauth");
      setRefreshingServerIds((prev) => new Set(prev).add(id));
      setComponentRefreshErrors((prev) => ({ ...prev, [id]: undefined }));
      try {
        const result = await serversApi.fetchToolsAfterOAuth(id);
        if (result.success === false) throw new Error(result.message);
        setComponentRevisions((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
      } catch (err) {
        setComponentRefreshErrors((prev) => ({ ...prev, [id]: { reason: sanitizeError(err) } }));
      } finally {
        pendingRefreshIds.current.delete(id);
        setRefreshingServerIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [canUpdateServer],
  );

  const handleAuthorize = useCallback(
    async (id: string) => {
      if (!canReadServers || pendingAuthorizationIds.current.has(id)) return;
      pendingAuthorizationIds.current.add(id);
      setSelectedServerIdForDetails(id);
      setDetailsInitialTab("components");
      setIsDetailsDrawerOpen(true);
      setOAuthAttempts((prev) => ({ ...prev, [id]: { state: "pending" } }));
      try {
        // Keep this call before any await: window.open requires the click gesture.
        await serversApi.triggerOAuthAuthorization(id);
      } catch (err) {
        setOAuthAttempts((prev) => {
          const next = { ...prev };
          if (err instanceof OAuthCancelledError) delete next[id];
          else next[id] = { state: "failed", reason: oauthFailureReason(err), dialogOpen: true };
          return next;
        });
        return;
      } finally {
        pendingAuthorizationIds.current.delete(id);
      }
      setOAuthAttempts((prev) => ({ ...prev, [id]: { state: "succeeded" } }));
      await Promise.allSettled([reloadOAuthStatuses([id]), discoverOAuthComponents(id), refetch()]);
    },
    [canReadServers, refetch, reloadOAuthStatuses, discoverOAuthComponents],
  );

  const dismissOAuthFailure = () => {
    if (!panelServer) return;
    const id = panelServer.id;
    setOAuthAttempts((prev) => {
      const attempt = prev[id];
      return attempt?.state === "failed"
        ? { ...prev, [id]: { ...attempt, dialogOpen: false } }
        : prev;
    });
  };

  const handleRefresh = useCallback(
    async (id: string, source: "table" | "panel" = "table") => {
      if (pendingRefreshIds.current.has(id)) return;
      pendingRefreshIds.current.add(id);
      refreshKinds.current.set(id, "manual");
      setComponentRefreshErrors((prev) => ({ ...prev, [id]: undefined }));
      setRefreshingServerIds((prev) => new Set(prev).add(id));

      const name = allServers.find((s) => s.id === id)?.name ?? id;

      try {
        const result = await serversApi.refreshTools(id);

        if (result && result.success === false) {
          if (source === "panel") {
            setComponentRefreshErrors((prev) => ({
              ...prev,
              [id]: { reason: result.error ?? undefined },
            }));
          } else {
            toast.error(intl.formatMessage({ id: "mcpServer.refresh.errorTitle" }), {
              description:
                result.error ?? intl.formatMessage({ id: "mcpServer.refresh.errorTitle" }),
            });
          }
          return;
        }

        setComponentRevisions((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
        const toolsAdded = result?.toolsAdded ?? 0;
        const toolsUpdated = result?.toolsUpdated ?? 0;
        const toolsRemoved = result?.toolsRemoved ?? 0;
        const resourcesAdded = result?.resourcesAdded ?? 0;
        const resourcesUpdated = result?.resourcesUpdated ?? 0;
        const resourcesRemoved = result?.resourcesRemoved ?? 0;
        const promptsAdded = result?.promptsAdded ?? 0;
        const promptsUpdated = result?.promptsUpdated ?? 0;
        const promptsRemoved = result?.promptsRemoved ?? 0;
        const hasChanges =
          toolsAdded ||
          toolsUpdated ||
          toolsRemoved ||
          resourcesAdded ||
          resourcesUpdated ||
          resourcesRemoved ||
          promptsAdded ||
          promptsUpdated ||
          promptsRemoved;

        const successMessage = hasChanges
          ? intl.formatMessage(
              { id: "mcpServer.refresh.success" },
              {
                name,
                toolsAdded,
                toolsUpdated,
                toolsRemoved,
                resourcesAdded,
                resourcesUpdated,
                resourcesRemoved,
                promptsAdded,
                promptsUpdated,
                promptsRemoved,
              },
            )
          : intl.formatMessage({ id: "mcpServer.refresh.successSimple" }, { name });

        const validationErrors = result?.validationErrors ?? [];
        if (validationErrors.length > 0) {
          // Backend can return success: true while skipping tools that failed schema
          // validation, so surface those errors instead of a plain success toast.
          const warningPrefix = intl.formatMessage(
            { id: "mcpServer.refresh.validationWarning" },
            { count: validationErrors.length },
          );
          toast.warning(successMessage, {
            description: [warningPrefix, ...validationErrors].join("\n"),
            // sonner's description has no white-space rule, so force newlines to render
            descriptionClassName: "whitespace-pre-line",
          });
        } else {
          toast.success(successMessage);
        }
        try {
          // Patch just the refreshed server into the list instead of refetching
          // the whole page (which remounts the table and flickers).
          serversApi.invalidateGetCache(id);
          const updated = await serversApi.get(id);
          patchServer(updated);
        } catch (refreshErr) {
          console.error("Failed to refresh servers after refresh:", sanitizeError(refreshErr));
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast.error(intl.formatMessage({ id: "mcpServer.refresh.conflict" }, { name }));
          return;
        }
        const detail = err instanceof ApiError ? extractApiErrorDetail(err.body) : null;
        const reason = detail ?? sanitizeError(err);
        if (source === "panel") {
          setComponentRefreshErrors((prev) => ({ ...prev, [id]: { reason } }));
        } else {
          toast.error(intl.formatMessage({ id: "mcpServer.refresh.errorTitle" }), {
            description: intl.formatMessage(
              { id: "mcpServer.refresh.error" },
              { name, detail: reason },
            ),
          });
        }
      } finally {
        pendingRefreshIds.current.delete(id);
        setRefreshingServerIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [allServers, intl, patchServer],
  );

  const handleViewDetails = useCallback((id: string) => {
    setDetailsInitialTab("tryit");
    setSelectedServerIdForDetails(id);
    setIsDetailsDrawerOpen(true);
  }, []);

  const handleCloseDetails = useCallback((open: boolean) => {
    if (!open) {
      setIsDetailsDrawerOpen(false);
      setSelectedServerIdForDetails(null);
    }
  }, []);

  const handleAddServerTag = useCallback(
    async (serverId: string, tags: string[]) => {
      try {
        const updated = await serversApi.updateTags(serverId, tags);
        setDetailsServer((prev) => (prev && prev.id === updated.id ? updated : prev));
        setAllServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      } catch (err) {
        const detail = err instanceof ApiError ? extractApiErrorDetail(err.body) : null;
        toast.error(detail || intl.formatMessage({ id: "mcpServer.tags.addError" }));
        throw err;
      }
    },
    [setDetailsServer, intl],
  );

  useEffect(() => {
    if (!selectedSearchServerId) return;
    setSelectedServerIdForDetails(selectedSearchServerId);
    setIsDetailsDrawerOpen(true);
  }, [selectedSearchServerId]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("cursor", nextCursor);
      params.set("limit", limit.toString());
      params.set("include_pagination", "true");
      params.set("include_inactive", "true");

      const result = await api.get<ServersResponse>(`/v1/mcp-servers?${params.toString()}`);
      setAllServers((prev) => [...prev, ...result.gateways]);
      setNextCursor(result.nextCursor ?? null);
    } catch (err) {
      console.error("Failed to load more servers:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, limit, loadingMore]);

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
  }, []);

  // Initialize state based on URL parameter to avoid flicker
  const [isFormOpen, setIsFormOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("openForm") === "true";
  });

  return (
    <div className="p-6">
      {isFormOpen ? (
        <MCPServerForm
          isOpen={isFormOpen}
          onToggle={() => {
            setIsFormOpen(false);
            setUpdateServerId(null);
          }}
          serverId={updateServerId || undefined}
          onSuccess={() => {
            setIsFormOpen(false);
            setUpdateServerId(null);
            refetch();
          }}
        />
      ) : isLoading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex items-center justify-center p-12"
        >
          <Loading />
          <span className="sr-only">{intl.formatMessage({ id: "mcpServer.loading" })}</span>
        </div>
      ) : (
        <>
          {error && (
            <div
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              <h3 className="font-semibold mb-1">
                {intl.formatMessage({ id: "mcpServer.error.loadingTitle" })}
              </h3>
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {toggleError && (
            <div className="mb-6">
              <InlineNotification
                type="error"
                message={toggleError}
                onDismiss={() => setToggleError(null)}
              />
            </div>
          )}

          {servers.length > 0 ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-base font-semibold text-foreground">
                  {intl.formatMessage({ id: "mcpServer.title" })}
                </h1>
                <div className="flex items-center gap-3">
                  <ListSearch
                    value={query}
                    onChange={setQuery}
                    ariaLabel={intl.formatMessage(
                      { id: "common.searchLabel" },
                      { entity: intl.formatMessage({ id: "mcpServer.title" }) },
                    )}
                    placeholder={intl.formatMessage({ id: "common.search" })}
                  />
                  {canCreateServer && (
                    <Button
                      variant="default"
                      className="h-7 rounded-sm px-4"
                      onClick={() => setIsFormOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      {intl.formatMessage({ id: "mcpServer.connect" })}
                    </Button>
                  )}
                </div>
              </div>

              <ServersTable
                servers={filteredServers}
                isLoading={isLoading}
                onEdit={canUpdateServer ? handleEdit : undefined}
                onDelete={canDeleteServer ? handleDelete : undefined}
                onViewDetails={handleViewDetails}
                onToggleEnabled={canUpdateServer ? handleToggleEnabled : undefined}
                onRefresh={canUpdateServer ? handleRefresh : undefined}
                refreshingServerIds={refreshingServerIds}
                oauthStatuses={oauthStatuses}
                authorizingServerIds={
                  new Set(
                    Object.keys(oauthAttempts).filter(
                      (id) => oauthAttempts[id].state === "pending",
                    ),
                  )
                }
                onAuthorize={canReadServers ? handleAuthorize : undefined}
                onRetryOAuthStatus={(id) => void retryOAuthStatus(id)}
              />
              {query.trim() && filteredServers.length === 0 && (
                <p className="mt-6 text-sm text-muted-foreground">
                  {intl.formatMessage({ id: "common.search.noResults" })}
                </p>
              )}

              <div className="flex items-center justify-between mt-6">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {intl.formatMessage(
                      { id: "mcpServer.list.showing" },
                      { count: filteredServers.length },
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="limit-select" className="text-sm text-muted-foreground">
                      {intl.formatMessage({ id: "mcpServer.list.perPage" })}
                    </label>
                    <select
                      id="limit-select"
                      value={limit}
                      onChange={(e) => handleLimitChange(Number(e.target.value))}
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
                {!query.trim() && nextCursor && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    aria-label={intl.formatMessage({ id: "mcpServer.list.loadMoreLabel" })}
                  >
                    {intl.formatMessage({
                      id: loadingMore ? "mcpServer.list.loadingMore" : "mcpServer.list.loadMore",
                    })}
                  </Button>
                )}
              </div>
            </>
          ) : (
            canCreateServer && (
              <div className="border border-border rounded-lg p-6 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-orange-500">
                    <MCPIcon className="size-4 [&_path]:fill-black" />
                  </div>
                  <h2 className="text-base font-medium">
                    {intl.formatMessage({ id: "mcpServer.empty.title" })}
                  </h2>
                </div>

                <div className="py-5">
                  <p className="text-sm text-foreground">
                    {intl.formatMessage({ id: "mcpServer.empty.description" })}
                  </p>
                </div>

                <Button
                  className="bg-foreground text-background hover:bg-foreground/90 h-8 w-38 rounded-sm px-2 gap-1.5 text-sm font-medium"
                  onClick={() => setIsFormOpen(true)}
                >
                  <Plus className="size-3" />
                  {intl.formatMessage({ id: "mcpServer.connect" })}
                </Button>
              </div>
            )
          )}
        </>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={intl.formatMessage({ id: "mcpServer.delete.title" })}
        description={intl.formatMessage({ id: "mcpServer.delete.description" })}
        confirmLabel={intl.formatMessage({ id: "common.button.delete" })}
        cancelLabel={intl.formatMessage({ id: "common.button.cancel" })}
        variant="destructive"
        onConfirm={confirmDelete}
      />

      <MCPServerDetailsPanel
        key={selectedServerIdForDetails ?? "none"}
        server={panelServer}
        initialTab={detailsInitialTab}
        oauthAttempt={panelAttempt}
        componentRefreshRevision={panelServer ? (componentRevisions[panelServer.id] ?? 0) : 0}
        componentRefreshError={panelServer ? componentRefreshErrors[panelServer.id] : undefined}
        isRefreshing={panelServer ? refreshingServerIds.has(panelServer.id) : false}
        onRefresh={
          canUpdateServer && panelServer ? () => handleRefresh(panelServer.id, "panel") : undefined
        }
        onRetryDiscovery={
          canUpdateServer && panelServer
            ? () =>
                refreshKinds.current.get(panelServer.id) === "manual"
                  ? handleRefresh(panelServer.id, "panel")
                  : discoverOAuthComponents(panelServer.id)
            : undefined
        }
        error={detailsError}
        open={isDetailsDrawerOpen}
        onClose={() => handleCloseDetails(false)}
        onAddTag={canUpdateServer ? handleAddServerTag : undefined}
        oauthStatus={panelServer ? oauthStatuses[panelServer.id] : undefined}
        onAuthorize={
          canReadServers && panelServer ? () => handleAuthorize(panelServer.id) : undefined
        }
        onRetryOAuthStatus={panelServer ? () => void retryOAuthStatus(panelServer.id) : undefined}
      />
      <ConfirmDialog
        open={isDetailsDrawerOpen && panelAttempt?.state === "failed" && panelAttempt.dialogOpen}
        onOpenChange={(open) => {
          if (!open) dismissOAuthFailure();
        }}
        title={intl.formatMessage(
          { id: "mcpServer.oauth.failureTitle" },
          { name: panelServer?.name ?? "" },
        )}
        description={
          <p className="break-words">
            {panelAttempt?.state === "failed" ? panelAttempt.reason : ""}
          </p>
        }
        confirmLabel={intl.formatMessage({ id: "mcpServer.oauth.tryAgain" })}
        cancelLabel={intl.formatMessage({ id: "mcpServer.oauth.dismiss" })}
        closeOnConfirm={false}
        onConfirm={async () => {
          if (panelServer) await handleAuthorize(panelServer.id);
        }}
        onCloseAutoFocus={(event) => {
          const authorize = document.getElementById(
            `oauth-authorize-${panelServer?.id}`,
          ) as HTMLButtonElement | null;
          const target =
            authorize && !authorize.disabled
              ? authorize
              : document.getElementById(`mcp-server-close-${panelServer?.id}`);
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      />
    </div>
  );
}
