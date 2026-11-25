/**
 * The "Refreshed X ago" hint under a polling home card's title, shared by
 * `McpHealthCard` and `A2aRuntimeCard`.
 */

import type { IntlShape } from "react-intl";

import { formatLastSeen } from "@/utils/format";

/** `lastUpdated` is epoch ms of the last settled poll, or null before one. */
export function formatRefreshedHint(intl: IntlShape, lastUpdated: number | null): string | null {
  if (lastUpdated == null) return null;
  if (Math.round((Date.now() - lastUpdated) / 1000) === 0) {
    return intl.formatMessage({ id: "dashboard.home.refreshedJustNow" });
  }
  const relative = formatLastSeen(new Date(lastUpdated).toISOString(), { locale: intl.locale });
  return relative ? intl.formatMessage({ id: "dashboard.home.refreshed" }, { relative }) : null;
}
