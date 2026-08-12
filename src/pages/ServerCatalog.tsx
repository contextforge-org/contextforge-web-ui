import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useIntl } from "react-intl";

import {
  CatalogResults,
  CatalogServerDetailsDialog,
} from "@/components/server-catalog/CatalogResults";
import {
  CatalogToolbar,
  type CatalogFilterDraft,
} from "@/components/server-catalog/CatalogToolbar";
import { EmptyStatePlaceholder } from "@/components/dashboard/EmptyStatePlaceholder";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Loading } from "@/components/ui/loading";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery } from "@/hooks/useQuery";
import { useRouter } from "@/router";

// TODO: Fetch subsequent pages when CatalogListResponse.total exceeds this MVP page limit.
const CATALOG_PATH = "/v1/catalog?limit=1000";
const PAGE_PATH = "/app/server-catalog";
const OPEN_AUTH_TYPE = "Open";
const PAGE_HEADING_ID = "server-catalog-heading";

interface CatalogFilters {
  search: string;
  category: string[];
  provider: string[];
  tags: string[];
  installedOnly: boolean;
}

type QueryUpdateValue = string | string[] | boolean | null;

function getQuery(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? "" : path.slice(queryIndex + 1);
}

function readMulti(params: URLSearchParams, key: string): string[] {
  return [...new Set(params.getAll(key).filter(Boolean))];
}

function parseFilters(path: string): CatalogFilters {
  const params = new URLSearchParams(getQuery(path));

  return {
    search: params.get("search") ?? "",
    category: readMulti(params, "category"),
    provider: readMulti(params, "provider"),
    tags: readMulti(params, "tags"),
    installedOnly: params.get("show_registered_only") === "true",
  };
}

function useCatalogFilters() {
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
          if (value) params.set(key, "true");
        } else if (value) {
          params.set(key, value);
        }
      });

      // Transitional: the auth type filter was removed while the catalog only
      // offers Open servers. Drop any auth_type left over in existing URLs so it
      // cannot survive later navigations. Remove once auth types ship again.
      params.delete("auth_type");

      const query = params.toString();
      navigate(query ? `${PAGE_PATH}?${query}` : PAGE_PATH, { replace: true });
    },
    [navigate, path],
  );

  // Commits every dialog filter in a single navigation so applying filters adds
  // exactly one history entry.
  const applyFilters = useCallback(
    (draft: CatalogFilterDraft) =>
      updateQuery({
        category: draft.category,
        provider: draft.provider,
        tags: draft.tags,
      }),
    [updateQuery],
  );

  return { filters, updateQuery, applyFilters };
}

function getOpenServers(servers: CatalogServer[]): CatalogServer[] {
  // MVP display scope includes only entries whose auth type is exactly Open.
  return servers.filter((server) => server.auth_type === OPEN_AUTH_TYPE);
}

function filterOpenServers(openServers: CatalogServer[], filters: CatalogFilters): CatalogServer[] {
  const search = filters.search.trim().toLocaleLowerCase();

  return openServers.filter((server) => {
    if (filters.category.length > 0 && !filters.category.includes(server.category ?? "")) {
      return false;
    }
    if (filters.provider.length > 0 && !filters.provider.includes(server.provider ?? "")) {
      return false;
    }
    if (filters.installedOnly && !server.is_registered) return false;
    if (filters.tags.length > 0 && !filters.tags.some((tag) => server.tags?.includes(tag))) {
      return false;
    }

    if (!search) return true;
    return `${server.name} ${server.description}`.toLocaleLowerCase().includes(search);
  });
}

function sortedUnique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function CatalogPageLayout({ children }: { children: ReactNode }) {
  const intl = useIntl();

  return (
    <section className="p-6" aria-labelledby={PAGE_HEADING_ID}>
      <h1 id={PAGE_HEADING_ID} className="text-base font-semibold text-foreground">
        {intl.formatMessage({ id: "mcpServer.catalog.title" })}
      </h1>
      {children}
    </section>
  );
}

export function ServerCatalog() {
  const intl = useIntl();
  const [selectedServer, setSelectedServer] = useState<CatalogServer | null>(null);
  const lastViewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { data, error, isLoading, refetch } = useQuery<CatalogListResponse>(CATALOG_PATH);
  const { filters, updateQuery, applyFilters } = useCatalogFilters();
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

  // Only the debounced search box filters ahead of the URL. Category, provider
  // and tag selections stay committed here: the dialog holds them as a draft
  // until Add filters is pressed, so an unapplied draft must never reach the grid.
  const activeFilters = useMemo(() => ({ ...filters, search }), [filters, search]);

  const openServers = useMemo(() => getOpenServers(data?.servers ?? []), [data?.servers]);
  const servers = useMemo(
    () => filterOpenServers(openServers, activeFilters),
    [openServers, activeFilters],
  );
  const categoryOptions = useMemo(
    () => sortedUnique(openServers.map((server) => server.category)),
    [openServers],
  );
  const providerOptions = useMemo(
    () => sortedUnique(openServers.map((server) => server.provider)),
    [openServers],
  );
  const tagOptions = useMemo(
    () => sortedUnique(openServers.flatMap((server) => server.tags ?? [])),
    [openServers],
  );
  const hasOpenServers = openServers.length > 0;
  const hasConnectedServers = openServers.some((server) => server.is_registered);
  const emptyStateMessageId = !hasOpenServers
    ? "mcpServer.catalog.empty"
    : filters.installedOnly && !hasConnectedServers
      ? "mcpServer.catalog.noneConnected"
      : "mcpServer.catalog.noResults";
  const activeFilterCount = filters.category.length + filters.provider.length + filters.tags.length;

  const handleView = useCallback((server: CatalogServer, trigger: HTMLButtonElement) => {
    lastViewTriggerRef.current = trigger;
    setSelectedServer(server);
  }, []);

  const handleDetailsOpenChange = useCallback((open: boolean) => {
    if (open) return;
    setSelectedServer(null);
    window.setTimeout(() => lastViewTriggerRef.current?.focus(), 0);
  }, []);

  if (isLoading) {
    return (
      <CatalogPageLayout>
        <div aria-busy="true">
          <Loading />
        </div>
      </CatalogPageLayout>
    );
  }

  if (error?.status === 404) {
    return (
      <CatalogPageLayout>
        <div role="status" aria-live="polite" className="mt-6">
          <EmptyStatePlaceholder messageId="mcpServer.catalog.disabled" />
        </div>
      </CatalogPageLayout>
    );
  }

  if (error) {
    return (
      <CatalogPageLayout>
        <div className="mt-6">
          <InlineNotification
            type="error"
            message={intl.formatMessage({ id: "mcpServer.catalog.error" })}
          />
          <Button
            className="mt-3"
            type="button"
            variant="outline"
            onClick={() => void refetch().catch(() => {})}
          >
            {intl.formatMessage({ id: "mcpServer.catalog.retry" })}
          </Button>
        </div>
      </CatalogPageLayout>
    );
  }

  return (
    <CatalogPageLayout>
      <CatalogToolbar
        search={search}
        installedOnly={filters.installedOnly}
        category={filters.category}
        provider={filters.provider}
        selectedTags={filters.tags}
        categories={categoryOptions}
        providers={providerOptions}
        availableTags={tagOptions}
        activeFilterCount={activeFilterCount}
        onSearchChange={setSearch}
        onInstalledChange={(installedOnly) => updateQuery({ show_registered_only: installedOnly })}
        onApply={applyFilters}
      />

      <CatalogResults
        servers={servers}
        emptyStateMessageId={emptyStateMessageId}
        onView={handleView}
      />

      <CatalogServerDetailsDialog server={selectedServer} onOpenChange={handleDetailsOpenChange} />
    </CatalogPageLayout>
  );
}
