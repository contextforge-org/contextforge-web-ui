/**
 * PostgreSQL and Redis chips from the admin-only `/version` diagnostics.
 * Callers fetch it only with `admin.system_config` and swallow a 403, so the
 * chips simply disappear for everyone else.
 */

import { Database, Server } from "lucide-react";
import { useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { isRedisConfigured, type VersionInfo } from "@/hooks/useSystemHealth";
import { cn } from "@/lib/utils";

export function HealthFooterChips({ data }: { data: VersionInfo }) {
  const intl = useIntl();
  const redisConfigured = isRedisConfigured(data);

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Database
          className={cn("size-3.5 shrink-0", !data.database.reachable && "text-destructive")}
          aria-hidden
        />
        {intl.formatMessage({ id: "dashboard.home.mcp.postgres" })}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Server
          className={cn(
            "size-3.5 shrink-0",
            redisConfigured && !data.redis.reachable && "text-destructive",
          )}
          aria-hidden
        />
        {intl.formatMessage({ id: "dashboard.home.mcp.redis" })}
        {!redisConfigured && (
          <span> ({intl.formatMessage({ id: "dashboard.home.mcp.notConfigured" })})</span>
        )}
      </span>
    </div>
  );
}

/** Reserves the chips' height while `/version` is in flight, so they don't pop in. */
export function HealthFooterChipsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}
