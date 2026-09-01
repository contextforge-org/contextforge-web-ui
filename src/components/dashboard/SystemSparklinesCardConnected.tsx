/**
 * Self-fetching wrapper for the resting home state.
 *
 * Renders nothing on a 403: most users lack `metrics:read`, and a permission
 * error they cannot act on does not belong on the landing page.
 */

import { useMetrics } from "@/hooks/useMetrics";

import { SystemSparklinesCard } from "./SystemSparklinesCard";

export function SystemSparklinesCardConnected() {
  const { timeseries, percentiles, isLoading, error, forbidden } = useMetrics();

  if (forbidden) return null;

  return (
    <SystemSparklinesCard
      timeseries={timeseries}
      percentiles={percentiles}
      loading={isLoading && timeseries === null}
      error={error}
    />
  );
}
