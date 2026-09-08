import { useMemo } from "react";
import { useIntl } from "react-intl";
import { useQuery } from "@/hooks/useQuery";
import { getTagLabels } from "@/utils/tags";
import type { Agent } from "@/types/agent";
import type { A2AAgentRead } from "@/generated/types";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { CardTag } from "@/components/ui/card-tag";
import { Typography } from "@/components/ui/typography";
import { AgentIcon } from "@/components/icons/AgentIcon";

// Only the fields the card actually renders — `Agent` also carries credential
// fields (authToken, authPassword, ...) that must never reach the UI. Typing
// the prop as this narrower `Pick` (rather than the full `Agent`) turns a
// stray `{agent.authToken}` into a type error instead of a silent leak.
type AgentCardFields = Pick<
  Agent,
  "id" | "name" | "description" | "enabled" | "reachable" | "tags"
>;

function AgentCard({ agent }: { agent: AgentCardFields }) {
  const intl = useIntl();
  const MAX_VISIBLE_TAGS = 8;
  const isActive = agent.enabled && agent.reachable;
  const tags = getTagLabels(agent.tags ?? []);
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
  const remainingCount = tags.length - MAX_VISIBLE_TAGS;

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
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {agent.description && (
          <Typography variant="caption" className="line-clamp-2">
            {agent.description}
          </Typography>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.map((tag, index) => (
              // Index in the key too: labels aren't guaranteed unique, and the
              // label alone would collide for a repeated tag on one agent.
              <CardTag key={`${tag}-${index}`}>{tag}</CardTag>
            ))}
            {remainingCount > 0 && <CardTag>+{remainingCount}</CardTag>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Agents() {
  const intl = useIntl();
  const {
    data: agentsData,
    error,
    isLoading,
  } = useQuery<A2AAgentRead[]>("/a2a?limit=0&include_inactive=true");

  const agents = useMemo(
    () =>
      (Array.isArray(agentsData) ? agentsData : []).filter(
        (agent): agent is Agent => agent !== null,
      ),
    [agentsData],
  );

  return (
    <div className="p-6">
      <Typography variant="heading3" as="h1" className="mb-6">
        {intl.formatMessage({ id: "agents.title" })}
      </Typography>

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

      {!isLoading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-1 p-12 text-center">
          <Typography variant="heading3" as="p">
            {intl.formatMessage({ id: "agents.empty.title" })}
          </Typography>
          <Typography variant="caption">
            {intl.formatMessage({ id: "agents.empty.description" })}
          </Typography>
        </div>
      )}

      {!isLoading && !error && agents.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          {agents.map((agent, index) => (
            // `A2AAgentRead.id` types as string | null | undefined; fall back
            // to index so a null/missing id can't collide with another card.
            <AgentCard key={agent.id ?? index} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
