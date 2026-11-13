import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useIntl } from "react-intl";
import { Activity, EllipsisVertical, PanelRightClose, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/useAuth";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import { useQuery } from "@/hooks/useQuery";
import { cn } from "@/lib/utils";
import { extractApiErrorDetail } from "@/utils/errors";
import { formatDateTime, formatLastSeen } from "@/utils/format";
import { getTagLabels } from "@/utils/tags";
import type { Agent } from "@/types/agent";
import type { RegisteredAgentCard } from "@/types/agentCard";
import type {
  A2AAgentPluginBindingListResponse,
  A2AAgentPluginBindingResponse,
} from "@/generated/types";
import { AgentIcon } from "@/components/icons/AgentIcon";
import {
  VisibilityInfoPopover,
  getVisibilityIcon,
} from "@/components/common/VisibilityInfoPopover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { InlineTagAdd } from "@/components/ui/inline-tag-add";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAgentSkillNames } from "./agentSkills";

// Only what the panel renders. `Agent` also carries credential fields
// (authToken, authPassword, ...) that must never reach the UI, so the panel
// accepts this narrower `Pick`: a stray `{agent.authToken}` is a type error.
// `authType` is the kind of credential, never its value.
export type AgentDetailsFields = Pick<
  Agent,
  | "id"
  | "name"
  | "description"
  | "endpointUrl"
  | "agentType"
  | "protocolVersion"
  | "capabilities"
  | "enabled"
  | "reachable"
  | "tags"
  | "authType"
  | "visibility"
  | "team"
  | "teamId"
  | "ownerEmail"
  | "createdAt"
  | "updatedAt"
  | "lastInteraction"
>;

const AUTH_TYPES = ["bearer", "basic", "authheaders", "query_param", "oauth"] as const;
type AuthType = (typeof AUTH_TYPES)[number];

/** Capabilities an agent card can declare, in the order they are listed. */
const CAPABILITY_KEYS = ["streaming", "pushNotifications", "stateTransitionHistory"] as const;

// TODO(IBM/mcp-context-forge#7383): the design shows "JSON-RPC", which is a protocol
// binding the gateway does not store yet. Until it does, show the stored agent type
// ("generic" by default) and read the binding here once it is available.
const PLUGIN_MANAGE_PERMISSION = "tools.manage_plugins";
const PLUGIN_READ_PERMISSION = "tools.read";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

/** A heading with label/value rows under it, in the centre column. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 pb-2">
      <h3 className="text-[13px] leading-4 font-medium text-foreground">{title}</h3>
      {/* One label width for every section, so values line up between them. Wide enough for "Push notifications" and its translations. */}
      <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-2 gap-y-2 text-[13px] leading-4 text-secondary-foreground">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span>{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </>
  );
}

function joinModes(modes?: string[]): string {
  return (modes ?? []).filter(Boolean).join(", ");
}

/** Whether a declared capability is on: a flag, or a non-empty list such as `extensions`. */
function isEnabled(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value === true;
}

interface AgentDetailsPanelProps {
  /** The agent to show; the panel reads it again for its current state. */
  agent: AgentDetailsFields | null;
  open: boolean;
  onClose: () => void;
  /** Omit to hide the action; the caller decides from the user's permissions. */
  onToggle?: (id: string, currentEnabled: boolean) => void;
  onDelete?: (id: string) => void;
  /**
   * Saves the agent's full tag list after an inline add; receives the agent ID
   * and the new complete list of labels, and rejects if saving fails. Omit to
   * show the tags without the "add" option.
   */
  onAddTag?: (id: string, tags: string[]) => Promise<void>;
}

/**
 * The panel that opens from an agent in the Agents list: its configuration, the
 * kind of authentication it uses (never a credential), the plugins bound to it,
 * and its lifecycle actions. Follows `ResourceDetailsPanel`.
 */
export function AgentDetailsPanel({
  agent,
  open,
  onClose,
  onToggle,
  onDelete,
  onAddTag,
}: AgentDetailsPanelProps) {
  const intl = useIntl();
  const { hasPermission, permissionsLoading } = useAuth();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const agentId = agent?.id ?? null;
  const headingId = `agent-details-heading-${agentId ?? "none"}`;

  // The list entry is what the page already holds; the read below only refreshes it.
  const {
    data: fetched,
    error: loadError,
    isLoading,
  } = useQuery<Agent>(open && agentId ? `/v1/a2a/${agentId}` : null);
  // The list entry is what a toggle updates, so its state and tags win over the read made on open.
  const current: AgentDetailsFields | null =
    agent && fetched
      ? {
          ...fetched,
          enabled: agent?.enabled ?? fetched.enabled,
          tags: agent?.tags ?? fetched.tags,
        }
      : agent;

  // The card has the agent's modes and skills. Without it the panel still shows the rest.
  const { data: card } = useQuery<RegisteredAgentCard>(
    open && agentId ? `/v1/a2a/${agentId}/card` : null,
  );

  const canReadPlugins = !permissionsLoading && hasPermission(PLUGIN_READ_PERMISSION);
  const canManagePlugins = !permissionsLoading && hasPermission(PLUGIN_MANAGE_PERMISSION);
  const teamId = current?.teamId ?? null;
  const {
    data: bindingList,
    error: bindingsError,
    setData: setBindingList,
  } = useQuery<A2AAgentPluginBindingListResponse>(
    open && teamId && canReadPlugins ? `/v1/a2a-agents/plugin-bindings/${teamId}` : null,
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Bindings are kept per team; this agent's are the ones that name it, plus team-wide ones.
  const bindings = useMemo(
    () =>
      (bindingList?.bindings ?? []).filter(
        (binding): binding is NonNullable<A2AAgentPluginBindingResponse> =>
          binding !== null &&
          binding !== undefined &&
          (binding.agentName === current?.name || binding.agentName === "*"),
      ),
    [bindingList, current?.name],
  );

  const removeBinding = useCallback(
    async (binding: NonNullable<A2AAgentPluginBindingResponse>) => {
      setRemovingId(binding.id);
      try {
        await agentsApi.deletePluginBinding(binding.id);
        setBindingList((prev) =>
          prev ? { ...prev, bindings: prev.bindings?.filter((b) => b?.id !== binding.id) } : prev,
        );
        toast.success(
          intl.formatMessage(
            { id: "agents.details.plugins.removeSuccess" },
            { plugin: binding.pluginId },
          ),
        );
      } catch (err) {
        const detail = err instanceof ApiError ? extractApiErrorDetail(err.body) : null;
        toast.error(
          detail ||
            intl.formatMessage(
              { id: "agents.details.plugins.removeError" },
              { plugin: binding.pluginId },
            ),
        );
      } finally {
        setRemovingId(null);
      }
    },
    [intl, setBindingList],
  );

  // Focus close on open; restore focus on close/unmount.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    closeButtonRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [open]);

  // ESC closes while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const notAvailable = intl.formatMessage({ id: "agents.details.notAvailable" });
  const VisibilityIcon = getVisibilityIcon(current?.visibility);

  const visibilityLabel = (() => {
    if (current?.visibility === "team") return intl.formatMessage({ id: "common.visibility.team" });
    if (current?.visibility === "public") {
      return intl.formatMessage({ id: "common.visibility.internal" });
    }
    if (current?.visibility === "private") {
      return intl.formatMessage({ id: "common.visibility.private" });
    }
    return notAvailable;
  })();

  const statusMessageId = !current?.enabled
    ? "agents.details.status.disabled"
    : current.reachable
      ? "agents.details.status.enabled"
      : "agents.details.status.unreachable";
  const isActive = Boolean(current?.enabled && current.reachable);

  const agentTypeLabel = current?.agentType
    ? current.agentType === "jsonrpc"
      ? intl.formatMessage({ id: "agents.details.agentType.jsonrpc" })
      : current.agentType
    : notAvailable;

  const skillNames = current ? getAgentSkillNames({ capabilities: current.capabilities }) : [];
  const skills = card?.skills?.length
    ? card.skills.map((skill) => skill.name || skill.id || "").filter(Boolean)
    : skillNames;

  const capabilitySource = card?.capabilities ?? current?.capabilities ?? {};
  const capabilityRows = [...CAPABILITY_KEYS, "extensions" as const]
    .filter((key) => key in capabilitySource)
    .map((key) => ({ key, enabled: isEnabled(capabilitySource[key]) }));

  const inputModes = joinModes(card?.defaultInputModes);
  const outputModes = joinModes(card?.defaultOutputModes);
  const authType: AuthType | "none" = AUTH_TYPES.includes(current?.authType as AuthType)
    ? (current?.authType as AuthType)
    : "none";
  const yesNo = (enabled: boolean) =>
    intl.formatMessage({ id: enabled ? "agents.details.yes" : "agents.details.no" });

  const tagLabels = getTagLabels(current?.tags ?? []);
  const lastUsed = formatLastSeen(current?.lastInteraction, { locale: intl.locale });
  const hasActions = Boolean(agentId && (onToggle || onDelete));

  return (
    <>
      <div
        data-state={open ? "open" : "closed"}
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 z-10 bg-black/50 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs",
          "data-[state=open]:opacity-100 data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none",
        )}
      />

      <aside
        role="region"
        aria-labelledby={headingId}
        aria-hidden={!open}
        inert={!open}
        data-state={open ? "open" : "closed"}
        className={cn(
          "absolute inset-y-0 right-0 z-20 flex w-[min(1236px,calc(100%-2rem))] border-l border-border bg-popover text-[13px] shadow-lg",
          "transition-transform duration-200 ease-out",
          "data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full",
          "data-[state=closed]:pointer-events-none",
        )}
      >
        {current && (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6 overflow-y-auto scrollbar-gutter-stable px-6 py-8 lg:px-12">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-agent-icon-bg">
                  <AgentIcon className="h-4 w-4 text-black" aria-hidden="true" />
                </div>
                <h2
                  id={headingId}
                  className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground"
                  title={current.name}
                >
                  {current.name}
                </h2>
                {hasActions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        aria-label={intl.formatMessage(
                          { id: "agents.card.actions.label" },
                          { name: current.name },
                        )}
                      >
                        <EllipsisVertical className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onToggle && (
                        <DropdownMenuItem
                          onClick={() => onToggle(agentId as string, current.enabled)}
                        >
                          {intl.formatMessage({
                            id: current.enabled
                              ? "agents.card.actions.disable"
                              : "agents.card.actions.enable",
                          })}
                        </DropdownMenuItem>
                      )}
                      {onDelete && (
                        <DropdownMenuItem
                          onClick={() => onDelete(agentId as string)}
                          className="text-red-600 dark:text-red-400"
                        >
                          {intl.formatMessage({ id: "agents.card.actions.delete" })}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {current.description && (
                <p className="text-sm leading-5 text-muted-foreground">{current.description}</p>
              )}

              {loadError && (
                <p role="alert" className="text-sm text-destructive">
                  {intl.formatMessage({ id: "agents.details.error" })}
                </p>
              )}
              {isLoading && !fetched && (
                <p role="status" className="sr-only">
                  {intl.formatMessage({ id: "agents.details.loading" })}
                </p>
              )}

              <hr className="border-border" />

              {skills.length > 0 && (
                <Section title={intl.formatMessage({ id: "agents.details.skills" })}>
                  <ul className="col-span-full space-y-2">
                    {skills.map((name, index) => (
                      // Index in the key too: skill names aren't guaranteed unique on one agent.
                      <li key={`${name}-${index}`}>{name}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {capabilityRows.length > 0 && (
                <Section title={intl.formatMessage({ id: "agents.details.capabilities" })}>
                  {capabilityRows.map((row) => (
                    <Row
                      key={row.key}
                      label={intl.formatMessage({ id: `agents.details.capability.${row.key}` })}
                    >
                      {yesNo(row.enabled)}
                    </Row>
                  ))}
                </Section>
              )}

              {(inputModes || outputModes) && (
                <Section title={intl.formatMessage({ id: "agents.details.modes" })}>
                  {inputModes && (
                    <Row label={intl.formatMessage({ id: "agents.details.modes.input" })}>
                      {inputModes}
                    </Row>
                  )}
                  {outputModes && (
                    <Row label={intl.formatMessage({ id: "agents.details.modes.output" })}>
                      {outputModes}
                    </Row>
                  )}
                </Section>
              )}

              <Section title={intl.formatMessage({ id: "agents.details.security" })}>
                <Row label={intl.formatMessage({ id: `agents.details.auth.name.${authType}` })}>
                  {intl.formatMessage({ id: `agents.details.auth.${authType}` })}
                </Row>
              </Section>

              {canReadPlugins && teamId && (bindings.length > 0 || bindingsError) && (
                <Section title={intl.formatMessage({ id: "agents.details.plugins" })}>
                  {bindingsError && (
                    <p role="alert" className="col-span-full text-destructive">
                      {intl.formatMessage({ id: "agents.details.plugins.error" })}
                    </p>
                  )}
                  <ul className="col-span-full space-y-2">
                    {bindings.map((binding) => (
                      <li key={binding.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          {binding.pluginId}
                          {binding.agentName === "*" && (
                            <span className="ml-2 text-muted-foreground">
                              {intl.formatMessage({ id: "agents.details.plugins.teamWide" })}
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {intl.formatMessage(
                            { id: "agents.details.plugins.meta" },
                            { mode: binding.mode, priority: binding.priority },
                          )}
                        </span>
                        {canManagePlugins && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground"
                            disabled={removingId === binding.id}
                            aria-label={intl.formatMessage(
                              { id: "agents.details.plugins.remove" },
                              { plugin: binding.pluginId },
                            )}
                            onClick={() => void removeBinding(binding)}
                          >
                            <X className="size-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            <aside className="relative border-t border-border lg:border-l lg:border-t-0">
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={intl.formatMessage({ id: "agents.details.close" })}
                className="absolute right-3 top-3 text-muted-foreground"
                onClick={onClose}
              >
                <PanelRightClose className="size-4" />
              </Button>

              <div className="border-b border-border p-4 pt-8">
                <h3 className="mb-7 text-sm font-semibold text-foreground">
                  {intl.formatMessage({ id: "agents.details.title" })}
                </h3>
                <dl className="space-y-4">
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.status" })}>
                    <span className="flex items-center gap-2">
                      <Activity
                        className={`size-3.5 ${isActive ? "text-tool-status-active" : "text-tool-status-inactive"}`}
                        aria-hidden="true"
                      />
                      {intl.formatMessage({ id: statusMessageId })}
                    </span>
                  </DetailRow>
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.visibility" })}>
                    <span className="flex items-center gap-2">
                      <VisibilityIcon className="size-3.5 text-muted-foreground" />
                      {visibilityLabel}
                      <VisibilityInfoPopover side="left" visibility={current.visibility} />
                    </span>
                  </DetailRow>
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.protocol" })}>
                    {current.protocolVersion
                      ? intl.formatMessage(
                          { id: "agents.details.protocol" },
                          { version: current.protocolVersion },
                        )
                      : notAvailable}
                  </DetailRow>
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.agentType" })}>
                    {agentTypeLabel}
                  </DetailRow>
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.endpoint" })}>
                    <CopyValue
                      label={intl.formatMessage({ id: "agents.details.label.endpoint" })}
                      value={current.endpointUrl}
                    />
                  </DetailRow>
                  {agentId && (
                    <DetailRow label={intl.formatMessage({ id: "agents.details.label.id" })}>
                      <CopyValue
                        label={intl.formatMessage({ id: "agents.details.label.id" })}
                        value={agentId}
                      />
                    </DetailRow>
                  )}
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.team" })}>
                    {current.team || current.teamId || notAvailable}
                  </DetailRow>
                  {(tagLabels.length > 0 || (agentId && onAddTag)) && (
                    <InlineTagAdd
                      label={intl.formatMessage({ id: "agents.details.label.tags" })}
                      existingTags={tagLabels}
                      onAdd={
                        agentId && onAddTag
                          ? (newTags) => onAddTag(agentId, [...tagLabels, ...newTags])
                          : undefined
                      }
                    >
                      {tagLabels.map((tag, index) => (
                        <Badge
                          key={`${tag}-${index}`}
                          variant="outline"
                          className="rounded-full px-2 py-0 text-[11px] font-medium text-muted-foreground"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </InlineTagAdd>
                  )}
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.owner" })}>
                    {current.ownerEmail || notAvailable}
                  </DetailRow>
                </dl>
              </div>

              <div className="p-4">
                <h3 className="mb-7 text-sm font-semibold text-foreground">
                  {intl.formatMessage({ id: "agents.details.activity" })}
                </h3>
                <dl className="space-y-4">
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.created" })}>
                    {formatDateTime(current.createdAt, notAvailable)}
                  </DetailRow>
                  <DetailRow
                    label={intl.formatMessage({ id: "agents.details.label.lastModified" })}
                  >
                    {formatDateTime(current.updatedAt, notAvailable)}
                  </DetailRow>
                  <DetailRow label={intl.formatMessage({ id: "agents.details.label.lastUsed" })}>
                    {lastUsed ?? intl.formatMessage({ id: "agents.details.never" })}
                  </DetailRow>
                </dl>
              </div>
            </aside>
          </div>
        )}
      </aside>
    </>
  );
}
