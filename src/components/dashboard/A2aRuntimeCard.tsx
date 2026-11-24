/**
 * A2aRuntimeCard (#7324) — the A2A home view.
 *
 * Title with a "Refreshed X ago" hint, the agent/success/response stat row, and
 * the shared dependency chips. The top-right status, the transport badge and
 * the subsystem row need runtime data no endpoint reports yet (#7323).
 */

import { useIntl } from "react-intl";

import { useAuth } from "@/auth/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useA2aMetrics } from "@/hooks/useA2aMetrics";
import { useSystemHealth, type SystemHealthResult } from "@/hooks/useSystemHealth";
import { formatLastSeen } from "@/utils/format";

import { EmptyStatePlaceholder } from "./EmptyStatePlaceholder";
import { HealthFooterChips, HealthFooterChipsSkeleton } from "./HealthFooterChips";
import { PermissionDenied } from "./PermissionDenied";
import { StatBlock } from "./SystemStat";
import { formatResponseTime, secondsToMs, UNAVAILABLE } from "./systemMetrics";

/** Guards against a partial or malformed aggregate. */
const num = (value: unknown): number | null =>
  typeof value === "number" && !Number.isNaN(value) ? value : null;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

export function A2aRuntimeCard({ health: sharedHealth }: { health?: SystemHealthResult } = {}) {
  const intl = useIntl();
  const { hasPermission } = useAuth();
  const { status, metrics, fallbackCounts, lastUpdated } = useA2aMetrics();

  const canViewSystem = hasPermission("admin.system_config");
  const ownHealth = useSystemHealth(undefined, canViewSystem && sharedHealth === undefined);
  const { data: health, isLoading: healthLoading, error: healthError } = sharedHealth ?? ownHealth;
  const showFooterSkeleton = canViewSystem && !health && healthLoading && !healthError;

  if (status === "forbidden") return <PermissionDenied />;
  if (status === "disabled") {
    return <EmptyStatePlaceholder messageId="dashboard.home.a2a.notConfigured" />;
  }

  if (status === "error") {
    return (
      <Shell>
        <div className="text-sm text-muted-foreground" role="alert">
          {intl.formatMessage({ id: "dashboard.home.a2a.error" })}
        </div>
      </Shell>
    );
  }

  const loading = status === "loading";
  const active = num(metrics?.activeAgents);
  const total = num(metrics?.totalAgents);
  const counts = active != null && total != null ? { active, total } : (fallbackCounts ?? null);

  if (!loading && counts && counts.total === 0) {
    return <EmptyStatePlaceholder messageId="dashboard.home.a2a.empty" />;
  }

  const refreshedText = (() => {
    if (lastUpdated == null) return null;
    if (Math.round((Date.now() - lastUpdated) / 1000) === 0) {
      return intl.formatMessage({ id: "dashboard.home.mcp.refreshedJustNow" });
    }
    const relative = formatLastSeen(new Date(lastUpdated).toISOString(), { locale: intl.locale });
    return relative
      ? intl.formatMessage({ id: "dashboard.home.mcp.refreshed" }, { relative })
      : null;
  })();

  const successRate = num(metrics?.successRate);
  const agentsValue = counts
    ? intl.formatMessage(
        { id: "dashboard.home.system.activeOfTotal" },
        { active: counts.active, total: counts.total },
      )
    : UNAVAILABLE;

  return (
    <Shell>
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          {intl.formatMessage({ id: "dashboard.home.a2a.title" })}
        </div>
        {refreshedText && <div className="text-xs text-muted-foreground">{refreshedText}</div>}
        {loading && !refreshedText && <Skeleton className="h-4 w-28" />}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatBlock
          label={intl.formatMessage({ id: "dashboard.home.a2a.agents" })}
          value={agentsValue}
          loading={loading}
        />
        <StatBlock
          label={intl.formatMessage({ id: "dashboard.home.a2a.successRate" })}
          value={successRate == null ? UNAVAILABLE : `${successRate.toFixed(1)}%`}
          loading={loading}
        />
        <StatBlock
          label={intl.formatMessage({ id: "dashboard.home.a2a.responseTime" })}
          value={formatResponseTime(secondsToMs(num(metrics?.avgResponseTime)))}
          loading={loading}
        />
      </div>

      {canViewSystem && health && <HealthFooterChips data={health} />}
      {showFooterSkeleton && <HealthFooterChipsSkeleton />}
    </Shell>
  );
}
