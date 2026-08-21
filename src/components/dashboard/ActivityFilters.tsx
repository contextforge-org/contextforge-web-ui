/**
 * ActivityFilters — the feed's filter tabs (All / Errors / Warnings, each with a
 * count) plus the search box.
 *
 * Counts key off `status === "error"` / `"warning"`, matching the mini-card
 * counters in `useMiniCardStatuses`, so the two never disagree. `info` has no
 * tab of its own: it is high-volume read/execute traffic that belongs under
 * "All activity" rather than as a severity filter.
 *
 * Filtering itself is owned by the caller; this component is presentational.
 */

import { useIntl } from "react-intl";

import { ListSearch } from "@/components/ui/list-search";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const ACTIVITY_FILTERS = ["all", "error", "warning"] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

const FILTER_LABEL: Record<ActivityFilter, string> = {
  all: "dashboard.home.activity.filter.all",
  error: "dashboard.home.activity.filter.errors",
  warning: "dashboard.home.activity.filter.warnings",
};

interface ActivityFiltersProps {
  filter: ActivityFilter;
  onFilterChange: (filter: ActivityFilter) => void;
  counts: Record<ActivityFilter, number>;
  search: string;
  onSearchChange: (search: string) => void;
}

export function ActivityFilters({
  filter,
  onFilterChange,
  counts,
  search,
  onSearchChange,
}: ActivityFiltersProps) {
  const intl = useIntl();

  return (
    <div className="flex items-center justify-between gap-3">
      <Tabs value={filter} onValueChange={(value) => onFilterChange(value as ActivityFilter)}>
        <TabsList>
          {ACTIVITY_FILTERS.map((id) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              {intl.formatMessage({ id: FILTER_LABEL[id] })}
              <span className="text-xs text-muted-foreground">{counts[id]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ListSearch
        value={search}
        onChange={onSearchChange}
        ariaLabel={intl.formatMessage({ id: "dashboard.home.activity.search" })}
        placeholder={intl.formatMessage({ id: "dashboard.home.activity.search" })}
      />
    </div>
  );
}
