import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { EllipsisVertical, FileText, Plus } from "lucide-react";
import { useIntl } from "react-intl";
import { STATUS_ICON, STATUS_TONE_CLASS } from "@/lib/status";
import type { OAuthGatewayStatus } from "@/api/catalog";

import { EmptyStatePlaceholder } from "@/components/dashboard/EmptyStatePlaceholder";
import { CatalogLogo } from "@/components/server-catalog/CatalogLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardTag } from "@/components/ui/card-tag";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CatalogServer } from "@/generated/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getTagLabels } from "@/utils/tags";

const EMPTY_PENDING_IDS: ReadonlySet<string> = new Set();
const EMPTY_OAUTH_STATUSES: Readonly<Record<string, OAuthGatewayStatus>> = {};

function getOAuthCardState(server: CatalogServer, status?: OAuthGatewayStatus) {
  const tokenState = status?.user_token_status?.status;
  if (tokenState === "valid")
    return {
      messageId: "mcpServer.catalog.connected",
      severity: "success" as const,
      canAuthorize: false,
    };
  if (tokenState === "near_expiry")
    return {
      messageId: "mcpServer.catalog.oauth.nearExpiry",
      severity: "warning" as const,
      canAuthorize: false,
    };
  if (tokenState === "expired")
    return {
      messageId: "mcpServer.catalog.oauth.expired",
      severity: "error" as const,
      canAuthorize: true,
    };
  if (server.requires_oauth_config || tokenState === "missing")
    return {
      messageId: "mcpServer.catalog.oauth.needsAuthorization",
      severity: "info" as const,
      canAuthorize: true,
    };
  return {
    messageId: "mcpServer.catalog.connected",
    severity: "success" as const,
    canAuthorize: false,
  };
}

function CatalogCard({
  server,
  onView,
  onAdd,
  onTest,
  onAuthorize,
  onDisconnect,
  isAdding,
  isTesting,
  isDisconnecting,
  canTest,
  canDisconnect,
  oauthStatuses,
}: {
  server: CatalogServer;
  onView: (trigger: HTMLElement) => void;
  onAdd: () => void;
  onTest: () => void;
  onAuthorize: () => void;
  onDisconnect: () => void;
  isAdding: boolean;
  isTesting: boolean;
  isDisconnecting: boolean;
  canTest: boolean;
  canDisconnect: boolean;
  oauthStatuses?: Readonly<Record<string, OAuthGatewayStatus>>;
}) {
  const intl = useIntl();
  const headingId = useId();
  const addTriggerRef = useRef<HTMLButtonElement | null>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shouldTransferAddFocusRef = useRef(false);
  const oauthState = getOAuthCardState(
    server,
    server.gateway_id ? oauthStatuses?.[server.gateway_id] : undefined,
  );
  const StatusIcon = STATUS_ICON[oauthState.severity];

  useEffect(() => {
    if (server.is_registered && shouldTransferAddFocusRef.current) {
      shouldTransferAddFocusRef.current = false;
      actionsTriggerRef.current?.focus();
      return;
    }

    if (!server.is_registered && !isAdding) {
      shouldTransferAddFocusRef.current = false;
    }
  }, [isAdding, server.is_registered]);

  return (
    <li className="min-w-0">
      <Card className="h-full min-h-[200px] gap-0 rounded-xl border border-border bg-card p-0 py-0 shadow-none ring-0 transition-colors hover:border-ring dark:hover:border-muted-foreground">
        <article className="flex h-full flex-col" aria-labelledby={headingId}>
          <CardContent className="flex flex-1 flex-col px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <CatalogLogo server={server} />
            </div>

            <h2 id={headingId} className="mt-4 truncate text-sm font-medium text-foreground">
              {server.name}
            </h2>
            <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
              {server.description}
            </p>

            <div className="mt-auto flex min-h-6 items-center gap-3 pt-4">
              {server.is_registered ? (
                <>
                  {isDisconnecting ? (
                    <span role="status" className="text-sm font-medium text-muted-foreground">
                      {intl.formatMessage({ id: "mcpServer.catalog.disconnecting" })}
                    </span>
                  ) : isTesting ? (
                    <span role="status" className="text-sm font-medium text-muted-foreground">
                      {intl.formatMessage({ id: "mcpServer.catalog.testing" })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <StatusIcon
                        className={`size-4 ${STATUS_TONE_CLASS[oauthState.severity]}`}
                        aria-hidden="true"
                      />
                      {intl.formatMessage({ id: oauthState.messageId })}
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        ref={actionsTriggerRef}
                        id={`catalog-server-actions-${server.id}`}
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={intl.formatMessage(
                          { id: "mcpServer.catalog.actionsFor" },
                          { name: server.name },
                        )}
                      >
                        <EllipsisVertical className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(event) => {
                        const trigger = pendingDetailsTriggerRef.current;
                        if (!trigger) return;
                        event.preventDefault();
                        pendingDetailsTriggerRef.current = null;
                        window.setTimeout(() => onView(trigger), 0);
                      }}
                    >
                      <DropdownMenuItem
                        onSelect={() => {
                          if (!actionsTriggerRef.current) return;
                          pendingDetailsTriggerRef.current = actionsTriggerRef.current;
                        }}
                      >
                        {intl.formatMessage({ id: "mcpServer.catalog.viewDetails" })}
                      </DropdownMenuItem>
                      {canTest && (
                        <DropdownMenuItem
                          disabled={
                            server.requires_oauth_config || isAdding || isTesting || isDisconnecting
                          }
                          onSelect={onTest}
                          title={
                            server.requires_oauth_config
                              ? intl.formatMessage({ id: "mcpServer.catalog.testOAuthPending" })
                              : undefined
                          }
                        >
                          {intl.formatMessage({ id: "mcpServer.catalog.test" })}
                        </DropdownMenuItem>
                      )}
                      {oauthState.canAuthorize && server.gateway_id && (
                        <DropdownMenuItem
                          disabled={isAdding || isDisconnecting}
                          onSelect={onAuthorize}
                        >
                          {intl.formatMessage({ id: "mcpServer.catalog.oauth.authorize" })}
                        </DropdownMenuItem>
                      )}
                      {canDisconnect && server.gateway_id && (
                        <DropdownMenuItem
                          disabled={isAdding || isTesting || isDisconnecting}
                          onSelect={onDisconnect}
                        >
                          {intl.formatMessage({ id: "mcpServer.catalog.disconnect" })}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Button
                  ref={addTriggerRef}
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={isAdding}
                  aria-label={intl.formatMessage(
                    {
                      id: isAdding
                        ? "mcpServer.catalog.addingServer"
                        : "mcpServer.catalog.addServer",
                    },
                    { name: server.name },
                  )}
                  onClick={() => {
                    shouldTransferAddFocusRef.current =
                      addTriggerRef.current?.ownerDocument.activeElement === addTriggerRef.current;
                    onAdd();
                  }}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  {isAdding
                    ? intl.formatMessage({ id: "mcpServer.catalog.adding" })
                    : intl.formatMessage({ id: "mcpServer.catalog.add" })}
                </Button>
              )}

              {!server.is_registered && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={intl.formatMessage(
                    { id: "mcpServer.catalog.viewServer" },
                    { name: server.name },
                  )}
                  onClick={(event) => onView(event.currentTarget)}
                >
                  <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              )}
            </div>
          </CardContent>
        </article>
      </Card>
    </li>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

export function CatalogServerDetailsDialog({
  server,
  onOpenChange,
}: {
  server: CatalogServer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const intl = useIntl();
  const tagsHeadingId = useId();
  const tagLabels = getTagLabels(server?.tags ?? []);

  return (
    <Dialog open={server !== null} onOpenChange={onOpenChange}>
      {server && (
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <CatalogLogo server={server} />
              <DialogTitle>{server.name}</DialogTitle>
            </div>
            <DialogDescription>{server.description}</DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
            <DetailRow label={intl.formatMessage({ id: "mcpServer.catalog.provider" })}>
              {server.provider}
            </DetailRow>
            <DetailRow label={intl.formatMessage({ id: "mcpServer.catalog.category" })}>
              {server.category}
            </DetailRow>
            <DetailRow label={intl.formatMessage({ id: "mcpServer.catalog.authentication" })}>
              {server.auth_type}
            </DetailRow>
            {server.transport && (
              <DetailRow label={intl.formatMessage({ id: "mcpServer.catalog.transport" })}>
                {server.transport}
              </DetailRow>
            )}
            <DetailRow label={intl.formatMessage({ id: "mcpServer.catalog.status" })}>
              {server.is_registered
                ? intl.formatMessage({ id: "mcpServer.catalog.connected" })
                : intl.formatMessage({ id: "mcpServer.catalog.notConnected" })}
            </DetailRow>
          </dl>

          {tagLabels.length > 0 && (
            <section aria-labelledby={tagsHeadingId}>
              <h3 id={tagsHeadingId} className="mb-2 text-sm font-medium text-muted-foreground">
                {intl.formatMessage({ id: "mcpServer.catalog.tags" })}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {tagLabels.map((tag) => (
                  <li key={tag}>
                    <CardTag variant="neutral">{tag}</CardTag>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

export function CatalogResults({
  servers,
  emptyStateMessageId,
  onView,
  onAdd,
  addingServerIds,
  onTest,
  onAuthorize,
  onDisconnect,
  testingServerIds = EMPTY_PENDING_IDS,
  disconnectingServerIds = EMPTY_PENDING_IDS,
  canTest,
  canDisconnect,
  oauthStatuses = EMPTY_OAUTH_STATUSES,
}: {
  servers: CatalogServer[];
  emptyStateMessageId: string;
  onView: (server: CatalogServer, trigger: HTMLElement) => void;
  onAdd: (server: CatalogServer) => void;
  addingServerIds: ReadonlySet<string>;
  onTest: (server: CatalogServer) => void;
  onAuthorize: (server: CatalogServer) => void;
  onDisconnect: (server: CatalogServer) => void;
  testingServerIds?: ReadonlySet<string>;
  disconnectingServerIds?: ReadonlySet<string>;
  canTest: boolean;
  canDisconnect: boolean;
  oauthStatuses?: Readonly<Record<string, OAuthGatewayStatus>>;
}) {
  const intl = useIntl();
  const announcedCount = useDebouncedValue(servers.length, 300);

  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {intl.formatMessage({ id: "mcpServer.catalog.resultCount" }, { count: announcedCount })}
      </p>
      {servers.length > 0 ? (
        <ul
          aria-label={intl.formatMessage({ id: "mcpServer.catalog.resultsLabel" })}
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6"
        >
          {servers.map((server) => (
            <CatalogCard
              key={server.id}
              server={server}
              onView={(trigger) => onView(server, trigger)}
              onAdd={() => onAdd(server)}
              onTest={() => onTest(server)}
              onAuthorize={() => onAuthorize(server)}
              onDisconnect={() => onDisconnect(server)}
              isAdding={addingServerIds.has(server.id)}
              isTesting={testingServerIds.has(server.id)}
              isDisconnecting={disconnectingServerIds.has(server.id)}
              canTest={canTest}
              canDisconnect={canDisconnect}
              oauthStatuses={oauthStatuses}
            />
          ))}
        </ul>
      ) : (
        <EmptyStatePlaceholder messageId={emptyStateMessageId} />
      )}
    </>
  );
}
