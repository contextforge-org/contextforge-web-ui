/**
 * ActivityView (#5531) — the active-state main content of the Activity feed
 * home view: filter tabs, search, and the list of recent activity.
 *
 * Permission gating lives at the page, not here. `HOME_STATES.activity` declares
 * `requiredPermission: "audit:read"`, so `NonDefaultState` renders a skeleton
 * while permissions load and `PermissionDenied` when the caller lacks it — this
 * component only mounts once the gate is open. That is also why the hook is
 * called without `enabled`: by the time we render, the permission is held.
 *
 * The error path below is therefore not the ordinary denied case. It covers the
 * stale/coarser-permission edge (client says yes, server says 403 — e.g. a
 * team-switch race), which is why it still checks `isPermissionDenied`.
 *
 * Search filters the fetched window client-side, so the feed is requested at the
 * server's max (`limit: 100`) rather than the hook's default of 10 — otherwise
 * search would only ever see the ten newest rows.
 *
 * The result count is announced from an always-mounted `role="status"` region,
 * as in `CatalogResults` and `PluginResults`.
 */

import { useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import type { ActivityItem } from "@/types/activity";

import { ACTIVITY_FILTERS, ActivityFilters, type ActivityFilter } from "./ActivityFilters";
import { ActivityRow } from "./ActivityRow";
import { EmptyStatePlaceholder } from "./EmptyStatePlaceholder";
import { isPermissionDenied, PermissionDenied } from "./PermissionDenied";

/** Server clamps to 100; search needs the widest window it will give us. */
const ACTIVITY_FEED_LIMIT = 100;

function matchesFilter(item: ActivityItem, filter: ActivityFilter): boolean {
  return filter === "all" || item.status === filter;
}

function matchesSearch(item: ActivityItem, needle: string): boolean {
  if (!needle) return true;
  const haystack = [item.title, item.description, item.resource_name, item.actor];
  return haystack.some((field) => field?.toLowerCase().includes(needle));
}

export function ActivityView() {
  const intl = useIntl();
  const { items, isLoading, error } = useRecentActivity({ limit: ACTIVITY_FEED_LIMIT });
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");

  // Counts reflect the fetched feed, not the search results: the tabs are a
  // severity breakdown of what is loaded, so they stay stable while typing.
  const counts = useMemo(() => {
    const byFilter = Object.fromEntries(ACTIVITY_FILTERS.map((id) => [id, 0])) as Record<
      ActivityFilter,
      number
    >;
    for (const item of items) {
      byFilter.all += 1;
      if (item.status === "error") byFilter.error += 1;
      if (item.status === "warning") byFilter.warning += 1;
    }
    return byFilter;
  }, [items]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => matchesFilter(item, filter) && matchesSearch(item, needle));
  }, [items, filter, search]);

  const announcedCount = useDebouncedValue(visible.length, 300);

  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;

  if (isPermissionDenied(error)) {
    return <PermissionDenied />;
  }

  if (items.length === 0) {
    return (
      <EmptyStatePlaceholder
        messageId={error ? "dashboard.home.activity.error" : "dashboard.home.activity.empty"}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {intl.formatMessage(
          { id: "dashboard.home.activity.resultCount" },
          { count: announcedCount },
        )}
      </p>
      <div className="px-4 py-3">
        <ActivityFilters
          filter={filter}
          onFilterChange={setFilter}
          counts={counts}
          search={search}
          onSearchChange={setSearch}
        />
      </div>
      {visible.length === 0 ? (
        <div className="border-t border-border px-4 py-8 text-sm text-muted-foreground">
          {intl.formatMessage({ id: "dashboard.home.activity.noMatches" })}
        </div>
      ) : (
        <ul
          className="divide-y divide-border border-t border-border"
          aria-label={intl.formatMessage({ id: "dashboard.home.card.activity" })}
        >
          {visible.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
