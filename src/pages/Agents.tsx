import { useCallback, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { EllipsisVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/useAuth";
import { useQuery } from "@/hooks/useQuery";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import { extractApiErrorDetail } from "@/utils/errors";
import type { Agent } from "@/types/agent";
import type { A2AAgentRead } from "@/generated/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { CardTag } from "@/components/ui/card-tag";
import { Typography } from "@/components/ui/typography";
import { AgentIcon } from "@/components/icons/AgentIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/servers/ConfirmDialog";
import { ConnectAgentForm } from "@/components/agents/ConnectAgentForm";
import { getAgentSkillNames } from "@/components/agents/agentSkills";

// Only the fields the card actually renders — `Agent` also carries credential
// fields (authToken, authPassword, ...) that must never reach the UI. Typing
// the prop as this narrower `Pick` (rather than the full `Agent`) turns a
// stray `{agent.authToken}` into a type error instead of a silent leak.
type AgentCardFields = Pick<
  Agent,
  "id" | "name" | "description" | "enabled" | "reachable" | "capabilities"
> & {
  /** Top-level skills list (IBM/mcp-context-forge#7433), not in the generated type yet. */
  skills?: unknown;
};

interface AgentCardProps {
  agent: AgentCardFields;
  /** Omit to hide the action; the caller decides from the user's permissions. */
  onToggle?: (id: string, currentEnabled: boolean) => void;
  onDelete?: (id: string) => void;
}

function AgentCard({ agent, onToggle, onDelete }: AgentCardProps) {
  const intl = useIntl();
  const MAX_VISIBLE_SKILLS = 8;
  const isActive = agent.enabled && agent.reachable;
  const skills = getAgentSkillNames(agent);
  const visibleSkills = skills.slice(0, MAX_VISIBLE_SKILLS);
  const remainingCount = skills.length - MAX_VISIBLE_SKILLS;

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-agent-icon-bg">
            <AgentIcon className="h-3.5 w-3.5 text-black" aria-hidden="true" />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              title={agent.name}
              className="min-w-0 truncate text-sm font-semibold text-foreground"
            >
              {agent.name}
            </span>
            <span
              role="img"
              aria-label={intl.formatMessage({
                id: isActive ? "agents.card.status.active" : "agents.card.status.inactive",
              })}
              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${isActive ? "bg-tool-status-active" : "bg-tool-status-inactive"}`}
            />
            {skills.length > 0 && (
              <span className="flex-shrink-0 text-sm font-semibold text-muted-foreground">
                {intl.formatMessage({ id: "agents.card.skills.count" }, { count: skills.length })}
              </span>
            )}
          </div>

          {agent.id && (onToggle || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 flex-shrink-0 p-0"
                  aria-label={intl.formatMessage(
                    { id: "agents.card.actions.label" },
                    { name: agent.name },
                  )}
                >
                  <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onToggle && (
                  <DropdownMenuItem onClick={() => onToggle(agent.id as string, agent.enabled)}>
                    {intl.formatMessage({
                      id: agent.enabled
                        ? "agents.card.actions.disable"
                        : "agents.card.actions.enable",
                    })}
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(agent.id as string)}
                    className="text-red-600 dark:text-red-400"
                  >
                    {intl.formatMessage({ id: "agents.card.actions.delete" })}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {agent.description && (
          <Typography variant="caption" className="line-clamp-2">
            {agent.description}
          </Typography>
        )}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleSkills.map((skill, index) => (
              // Index in the key too: skill names aren't guaranteed unique on one agent.
              <CardTag key={`${skill}-${index}`}>{skill}</CardTag>
            ))}
            {remainingCount > 0 && <CardTag>+{remainingCount}</CardTag>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Styled like the Tools page's "Add tools" card.
function ConnectAgentCard({ onConnect }: { onConnect: () => void }) {
  const intl = useIntl();
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className="cursor-pointer transition-opacity hover:opacity-90"
      onClick={onConnect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onConnect();
        }
      }}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-tool-add-icon-bg shadow-sm">
            <Plus className="h-3.5 w-3.5 text-tool-add-icon-fg" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold text-foreground">
            {intl.formatMessage({ id: "agents.connect.title" })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {intl.formatMessage({ id: "agents.connect.description" })}
        </p>
      </CardContent>
    </Card>
  );
}

export function Agents() {
  const intl = useIntl();
  const { hasPermission, permissionsLoading } = useAuth();
  const canUpdate = !permissionsLoading && hasPermission("a2a.update");
  const canDelete = !permissionsLoading && hasPermission("a2a.delete");
  const canCreate = !permissionsLoading && hasPermission("a2a.create");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const {
    data: agentsData,
    error,
    isLoading,
    setData: setAgentsData,
    refetch,
  } = useQuery<A2AAgentRead[]>("/v1/a2a?limit=0&include_inactive=true");

  const agents = useMemo(
    () =>
      (Array.isArray(agentsData) ? agentsData : []).filter(
        (agent): agent is Agent => agent !== null,
      ),
    [agentsData],
  );

  // Tracks agent IDs with an in-flight toggle so a repeated click can't fire a
  // second mutation against a stale state before the first settles.
  const pendingToggleIds = useRef<Set<string>>(new Set());

  const handleToggle = useCallback(
    async (id: string, currentEnabled: boolean) => {
      if (pendingToggleIds.current.has(id)) return;
      pendingToggleIds.current.add(id);

      const nextEnabled = !currentEnabled;
      const name = agents.find((a) => a.id === id)?.name ?? id;
      setAgentsData((prev) =>
        prev?.map((a) => (a?.id === id ? { ...a, enabled: nextEnabled } : a)),
      );

      try {
        const updated = await agentsApi.setState(id, nextEnabled);
        setAgentsData((prev) => prev?.map((a) => (a?.id === id ? { ...a, ...updated } : a)));
        toast.success(
          intl.formatMessage(
            { id: nextEnabled ? "agents.toast.enableSuccess" : "agents.toast.disableSuccess" },
            { name },
          ),
        );
      } catch (err) {
        setAgentsData((prev) =>
          prev?.map((a) => (a?.id === id ? { ...a, enabled: currentEnabled } : a)),
        );
        const detail = err instanceof ApiError ? extractApiErrorDetail(err.body) : null;
        toast.error(
          detail ||
            intl.formatMessage({
              id: nextEnabled ? "agents.toast.enableError" : "agents.toast.disableError",
            }),
        );
      } finally {
        pendingToggleIds.current.delete(id);
      }
    },
    [agents, setAgentsData, intl],
  );

  const handleDeleteRequest = useCallback(
    (id: string) => {
      setDeleteTarget({ id, name: agents.find((a) => a.id === id)?.name ?? id });
    },
    [agents],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setIsDeleting(true);
    try {
      await agentsApi.delete(id);
      setAgentsData((prev) => prev?.filter((a) => a?.id !== id));
      toast.success(intl.formatMessage({ id: "agents.delete.success" }, { name }));
      setDeleteTarget(null);
      // The card that held focus is gone; keep keyboard users anchored.
      headingRef.current?.focus();
    } catch (err) {
      const detail = err instanceof ApiError ? extractApiErrorDetail(err.body) : null;
      toast.error(detail || intl.formatMessage({ id: "agents.delete.error" }, { name }));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, setAgentsData, intl]);

  const handleConnected = useCallback(
    (created: A2AAgentRead) => {
      setIsConnecting(false);
      toast.success(intl.formatMessage({ id: "agents.connect.success" }, { name: created?.name }));
      // The list is the source of truth for what the gateway now holds; a failed
      // refresh must not undo a registration that already succeeded.
      refetch().catch(() => {});
    },
    [intl, refetch],
  );

  if (isConnecting) {
    return (
      <div className="p-6">
        <ConnectAgentForm onCancel={() => setIsConnecting(false)} onCreated={handleConnected} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 ref={headingRef} tabIndex={-1} className="mb-6 text-base font-semibold text-foreground">
        {intl.formatMessage({ id: "agents.title" })}
      </h1>

      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex items-center justify-center p-12"
        >
          <span className="sr-only">{intl.formatMessage({ id: "agents.loading" })}</span>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
        </div>
      )}

      {error && (
        <div
          className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
          role="alert"
          aria-live="assertive"
        >
          {/* A label, not a structural heading — an <h3> here would skip
              straight from the page's <h1> with no <h2> in between. */}
          <p className="mb-1 font-semibold">{intl.formatMessage({ id: "agents.error.loading" })}</p>
          <p className="text-red-800 dark:text-red-200">{error.message}</p>
        </div>
      )}

      {!isLoading && !error && agents.length === 0 && !canCreate && (
        <div className="flex flex-col items-center justify-center gap-1 p-12 text-center">
          <Typography variant="heading3" as="p">
            {intl.formatMessage({ id: "agents.empty.title" })}
          </Typography>
          <Typography variant="caption">
            {intl.formatMessage({ id: "agents.empty.description" })}
          </Typography>
        </div>
      )}

      {!isLoading && !error && (agents.length > 0 || canCreate) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          {canCreate && <ConnectAgentCard onConnect={() => setIsConnecting(true)} />}
          {agents.map((agent, index) => (
            // `A2AAgentRead.id` types as string | null | undefined; fall back
            // to index so a null/missing id can't collide with another card.
            <AgentCard
              key={agent.id ?? index}
              agent={agent}
              onToggle={canUpdate ? handleToggle : undefined}
              onDelete={canDelete ? handleDeleteRequest : undefined}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={confirmDelete}
        title={intl.formatMessage({ id: "agents.delete.confirm.title" })}
        description={intl.formatMessage(
          { id: "agents.delete.confirm.description" },
          { name: deleteTarget?.name },
        )}
        confirmLabel={intl.formatMessage({ id: "agents.delete.confirm.button" })}
        variant="destructive"
        role="alertdialog"
        closeOnConfirm={false}
        isLoading={isDeleting}
      />
    </div>
  );
}
