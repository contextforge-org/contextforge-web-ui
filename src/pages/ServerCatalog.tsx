import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { useIntl } from "react-intl";

import { registerCatalogServer } from "@/api/catalog";
import { ApiError } from "@/api/client";
import {
  CatalogResults,
  CatalogServerDetailsDialog,
} from "@/components/server-catalog/CatalogResults";
import {
  CatalogToolbar,
  type CatalogFilterSection,
} from "@/components/server-catalog/CatalogToolbar";
import { EmptyStatePlaceholder } from "@/components/dashboard/EmptyStatePlaceholder";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Loading } from "@/components/ui/loading";
import type { CatalogListResponse, CatalogServer } from "@/generated/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery } from "@/hooks/useQuery";
import { useRouter } from "@/router";
import { getTagLabels } from "@/utils/tags";

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

interface RegistrationNotification {
  type: "success" | "error";
  message: string;
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

  const toggleFilterOption = useCallback(
    (section: CatalogFilterSection, option: string, checked: boolean) => {
      const current = filters[section];
      updateQuery({
        [section]: checked ? [...current, option] : current.filter((item) => item !== option),
      });
    },
    [filters, updateQuery],
  );

  const clearFilterSection = useCallback(
    (section: CatalogFilterSection) => updateQuery({ [section]: [] }),
    [updateQuery],
  );

  // Drops the three popover sections in one navigation. The search box and the
  // connected-only toggle live outside the popover and are left alone.
  const clearAllFilters = useCallback(
    () => updateQuery({ category: [], provider: [], tags: [] }),
    [updateQuery],
  );

  return { filters, updateQuery, toggleFilterOption, clearFilterSection, clearAllFilters };
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
    const serverTags = getTagLabels(server.tags ?? []);
    if (filters.tags.length > 0 && !filters.tags.some((tag) => serverTags.includes(tag))) {
      return false;
    }

    if (!search) return true;
    return `${server.name} ${server.description}`.toLocaleLowerCase().includes(search);
  });
}

function sortedUnique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function setCatalogServerRegistration(
  catalog: CatalogListResponse | undefined,
  serverId: string,
  isRegistered: boolean,
): CatalogListResponse | undefined {
  if (!catalog) return catalog;

  const serverIndex = catalog.servers.findIndex((server) => server.id === serverId);
  if (serverIndex === -1 || catalog.servers[serverIndex].is_registered === isRegistered) {
    return catalog;
  }

  const servers = [...catalog.servers];
  servers[serverIndex] = { ...servers[serverIndex], is_registered: isRegistered };
  return { ...catalog, servers };
}

function removeCatalogServer(
  catalog: CatalogListResponse | undefined,
  serverId: string,
): CatalogListResponse | undefined {
  if (!catalog) return catalog;

  const servers = catalog.servers.filter((server) => server.id !== serverId);
  if (servers.length === catalog.servers.length) return catalog;

  return {
    ...catalog,
    servers,
    total: Math.max(0, catalog.total - 1),
  };
}

function CatalogPageLayout({
  children,
  headingRef,
}: {
  children: ReactNode;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const intl = useIntl();

  return (
    <section className="p-6" aria-labelledby={PAGE_HEADING_ID}>
      <h1
        ref={headingRef}
        id={PAGE_HEADING_ID}
        tabIndex={-1}
        className="text-base font-semibold text-foreground"
      >
        {intl.formatMessage({ id: "mcpServer.catalog.title" })}
      </h1>
      {children}
    </section>
  );
}

export function ServerCatalog() {
  const intl = useIntl();
  const [selectedServer, setSelectedServer] = useState<CatalogServer | null>(null);
  const [addingServerIds, setAddingServerIds] = useState<ReadonlySet<string>>(() => new Set());
  const [registrationNotification, setRegistrationNotification] =
    useState<RegistrationNotification | null>(null);
  const addingServerIdsRef = useRef(new Set<string>());
  const lastViewTriggerRef = useRef<HTMLElement | null>(null);
  const pageHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const registrationNotificationRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusRegistrationNotificationRef = useRef(false);
  const { data, error, isLoading, refetch, setData } = useQuery<CatalogListResponse>(CATALOG_PATH);
  const { filters, updateQuery, toggleFilterOption, clearFilterSection, clearAllFilters } =
    useCatalogFilters();
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

  useEffect(() => {
    if (!registrationNotification || !shouldFocusRegistrationNotificationRef.current) return;

    shouldFocusRegistrationNotificationRef.current = false;
    registrationNotificationRef.current?.focus();
  }, [registrationNotification]);

  // Only the search box filters ahead of the URL, so the grid can react to the
  // debounced value. Category, provider and tag selections are committed to the
  // URL the moment they are ticked in the filters popover.
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
    () => sortedUnique(openServers.flatMap((server) => getTagLabels(server.tags ?? []))),
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

  const handleView = useCallback((server: CatalogServer, trigger: HTMLElement) => {
    lastViewTriggerRef.current = trigger;
    setSelectedServer(server);
  }, []);

  const refreshCatalogSilently = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // The mutation result remains reflected in the cached data. A later
      // successful fetch will replace that optimistic value authoritatively.
    }
  }, [refetch]);

  const handleAdd = useCallback(
    async (server: CatalogServer) => {
      if (addingServerIdsRef.current.has(server.id)) return;

      addingServerIdsRef.current.add(server.id);
      setAddingServerIds(new Set(addingServerIdsRef.current));
      setRegistrationNotification(null);
      try {
        const result = await registerCatalogServer(server.id);
        if (!result.success) {
          setRegistrationNotification({
            type: "error",
            message: result.message || intl.formatMessage({ id: "mcpServer.catalog.addError" }),
          });
          return;
        }

        setData((current) => setCatalogServerRegistration(current, server.id, true));
      } catch (registrationError) {
        if (registrationError instanceof ApiError && registrationError.status === 409) {
          setData((current) => setCatalogServerRegistration(current, server.id, true));
          setRegistrationNotification({
            type: "success",
            message: intl.formatMessage(
              { id: "mcpServer.catalog.alreadyConnected" },
              { name: server.name },
            ),
          });
          return;
        }

        if (registrationError instanceof ApiError && registrationError.status === 404) {
          setData((current) => removeCatalogServer(current, server.id));
          shouldFocusRegistrationNotificationRef.current = true;
          setRegistrationNotification({
            type: "error",
            message: intl.formatMessage(
              { id: "mcpServer.catalog.addNotFound" },
              { name: server.name },
            ),
          });
          await refreshCatalogSilently();
          return;
        }

        setRegistrationNotification({
          type: "error",
          message: intl.formatMessage({ id: "mcpServer.catalog.addError" }),
        });
      } finally {
        addingServerIdsRef.current.delete(server.id);
        setAddingServerIds(new Set(addingServerIdsRef.current));
      }
    },
    [intl, refreshCatalogSilently, setData],
  );

  const handleDetailsOpenChange = useCallback((open: boolean) => {
    if (open) return;
    setSelectedServer(null);
    window.setTimeout(() => lastViewTriggerRef.current?.focus(), 0);
  }, []);

  const handleRegistrationNotificationDismiss = useCallback(() => {
    const notification = registrationNotificationRef.current;
    const shouldRestoreFocus = notification?.contains(notification.ownerDocument.activeElement);
    setRegistrationNotification(null);
    if (shouldRestoreFocus) {
      window.setTimeout(() => pageHeadingRef.current?.focus(), 0);
    }
  }, []);

  if (isLoading && !data) {
    return (
      <CatalogPageLayout headingRef={pageHeadingRef}>
        <div aria-busy="true">
          <Loading />
        </div>
      </CatalogPageLayout>
    );
  }

  if (error?.status === 404 && !data) {
    return (
      <CatalogPageLayout headingRef={pageHeadingRef}>
        <div role="status" aria-live="polite" className="mt-6">
          <EmptyStatePlaceholder messageId="mcpServer.catalog.disabled" />
        </div>
      </CatalogPageLayout>
    );
  }

  if (error && !data) {
    return (
      <CatalogPageLayout headingRef={pageHeadingRef}>
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
    <CatalogPageLayout headingRef={pageHeadingRef}>
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
        onToggleOption={toggleFilterOption}
        onClearSection={clearFilterSection}
        onClearAll={clearAllFilters}
      />

      {registrationNotification && (
        <div className="mb-4">
          <InlineNotification
            ref={registrationNotificationRef}
            type={registrationNotification.type}
            message={registrationNotification.message}
            tabIndex={-1}
            onDismiss={handleRegistrationNotificationDismiss}
          />
        </div>
      )}

      <CatalogResults
        servers={servers}
        emptyStateMessageId={emptyStateMessageId}
        onView={handleView}
        onAdd={(server) => void handleAdd(server)}
        addingServerIds={addingServerIds}
      />

      <CatalogServerDetailsDialog server={selectedServer} onOpenChange={handleDetailsOpenChange} />
    </CatalogPageLayout>
  );
}
