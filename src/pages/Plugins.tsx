import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useIntl } from "react-intl";

import { EmptyStatePlaceholder } from "@/components/dashboard/EmptyStatePlaceholder";
import { PluginDetailsDialog, PluginResults } from "@/components/plugins/PluginResults";
import { PluginToolbar, type PluginFilterDraft } from "@/components/plugins/PluginToolbar";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Loading } from "@/components/ui/loading";
import type { PluginListResponse, PluginSummary } from "@/generated/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery } from "@/hooks/useQuery";
import { useRouter } from "@/router";

const PLUGINS_PATH = "/v1/plugins";
const PAGE_PATH = "/app/plugins";
const ENABLED_STATUS = "enabled";
const PAGE_HEADING_ID = "plugins-catalog-heading";

interface PluginFilters {
  search: string;
  hook: string[];
  tags: string[];
  enabledOnly: boolean;
}

type QueryUpdateValue = string | string[] | boolean | null;

function getQuery(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? "" : path.slice(queryIndex + 1);
}

function readMulti(params: URLSearchParams, key: string): string[] {
  return [...new Set(params.getAll(key).filter(Boolean))];
}

function parseFilters(path: string): PluginFilters {
  const params = new URLSearchParams(getQuery(path));

  return {
    search: params.get("search") ?? "",
    hook: readMulti(params, "hook"),
    tags: readMulti(params, "tags"),
    enabledOnly: params.get("status") === ENABLED_STATUS,
  };
}

function usePluginFilters() {
  const { path, navigate } = useRouter();
  const filters = useMemo(() => parseFilters(path), [path]);

  const updateQuery = useCallback(
    (updates: Record<string, QueryUpdateValue>) => {
      const params = new URLSearchParams(getQuery(path));

      Object.entries(updates).forEach(([key, value]) => {
        params.delete(key);
        if (Array.isArray(value)) {
          value.forEach((item) => params.append(key, item));
        } else if (typeof value === "boolean") {
          if (value) params.set(key, ENABLED_STATUS);
        } else if (value) {
          params.set(key, value);
        }
      });

      const query = params.toString();
      navigate(query ? `${PAGE_PATH}?${query}` : PAGE_PATH, { replace: true });
    },
    [navigate, path],
  );

  // Commits every dialog filter in a single navigation so applying filters adds
  // exactly one history entry.
  const applyFilters = useCallback(
    (draft: PluginFilterDraft) =>
      updateQuery({
        hook: draft.hook,
        tags: draft.tags,
      }),
    [updateQuery],
  );

  return { filters, updateQuery, applyFilters };
}

function filterPlugins(plugins: PluginSummary[], filters: PluginFilters): PluginSummary[] {
  const search = filters.search.trim().toLocaleLowerCase();

  return plugins.filter((plugin) => {
    if (filters.hook.length > 0 && !filters.hook.some((hook) => plugin.hooks?.includes(hook))) {
      return false;
    }
    if (filters.tags.length > 0 && !filters.tags.some((tag) => plugin.tags?.includes(tag))) {
      return false;
    }
    if (filters.enabledOnly && plugin.status !== ENABLED_STATUS) return false;

    if (!search) return true;
    return `${plugin.name} ${plugin.description ?? ""}`.toLocaleLowerCase().includes(search);
  });
}

function sortedUnique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function PluginsPageLayout({ children }: { children: ReactNode }) {
  const intl = useIntl();

  return (
    <section className="p-6" aria-labelledby={PAGE_HEADING_ID}>
      <h1 id={PAGE_HEADING_ID} className="text-base font-semibold text-foreground">
        {intl.formatMessage({ id: "plugins.catalog.title" })}
      </h1>
      {children}
    </section>
  );
}

export function Plugins() {
  const intl = useIntl();
  const [selectedPlugin, setSelectedPlugin] = useState<PluginSummary | null>(null);
  const lastViewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { data, error, isLoading, refetch } = useQuery<PluginListResponse>(PLUGINS_PATH);
  const { filters, updateQuery, applyFilters } = usePluginFilters();
  const [search, setSearch] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      updateQuery({ search: debouncedSearch || null });
    }
  }, [debouncedSearch, filters.search, updateQuery]);

  const activeFilters = useMemo(() => ({ ...filters, search }), [filters, search]);

  const allPlugins = useMemo(() => data?.plugins ?? [], [data?.plugins]);
  const plugins = useMemo(
    () => filterPlugins(allPlugins, activeFilters),
    [allPlugins, activeFilters],
  );
  const hookOptions = useMemo(
    () => sortedUnique(allPlugins.flatMap((plugin) => plugin.hooks ?? [])),
    [allPlugins],
  );
  const tagOptions = useMemo(
    () => sortedUnique(allPlugins.flatMap((plugin) => plugin.tags ?? [])),
    [allPlugins],
  );
  const hasPlugins = allPlugins.length > 0;
  const hasEnabledPlugins = allPlugins.some((plugin) => plugin.status === ENABLED_STATUS);
  const emptyStateMessageId = !hasPlugins
    ? "plugins.catalog.empty"
    : filters.enabledOnly && !hasEnabledPlugins
      ? "plugins.catalog.noneEnabled"
      : "plugins.catalog.noResults";
  const activeFilterCount = filters.hook.length + filters.tags.length;

  const handleView = useCallback((plugin: PluginSummary, trigger: HTMLButtonElement) => {
    lastViewTriggerRef.current = trigger;
    setSelectedPlugin(plugin);
  }, []);

  const handleDetailsOpenChange = useCallback((open: boolean) => {
    if (open) return;
    setSelectedPlugin(null);
    window.setTimeout(() => lastViewTriggerRef.current?.focus(), 0);
  }, []);

  if (isLoading) {
    return (
      <PluginsPageLayout>
        <div aria-busy="true">
          <Loading />
        </div>
      </PluginsPageLayout>
    );
  }

  if (error) {
    return (
      <PluginsPageLayout>
        <div className="mt-6">
          <InlineNotification
            type="error"
            message={intl.formatMessage({ id: "plugins.catalog.error" })}
          />
          <Button
            className="mt-3"
            type="button"
            variant="outline"
            onClick={() => void refetch().catch(() => {})}
          >
            {intl.formatMessage({ id: "plugins.catalog.retry" })}
          </Button>
        </div>
      </PluginsPageLayout>
    );
  }

  if (data?.plugins_globally_enabled === false) {
    return (
      <PluginsPageLayout>
        <div role="status" aria-live="polite" className="mt-6">
          <EmptyStatePlaceholder messageId="plugins.catalog.globallyDisabled" />
        </div>
      </PluginsPageLayout>
    );
  }

  return (
    <PluginsPageLayout>
      <PluginToolbar
        search={search}
        enabledOnly={filters.enabledOnly}
        hook={filters.hook}
        selectedTags={filters.tags}
        hooks={hookOptions}
        availableTags={tagOptions}
        activeFilterCount={activeFilterCount}
        onSearchChange={setSearch}
        onEnabledOnlyChange={(enabledOnly) => updateQuery({ status: enabledOnly })}
        onApply={applyFilters}
      />

      <PluginResults
        plugins={plugins}
        emptyStateMessageId={emptyStateMessageId}
        onView={handleView}
      />

      <PluginDetailsDialog plugin={selectedPlugin} onOpenChange={handleDetailsOpenChange} />
    </PluginsPageLayout>
  );
}
