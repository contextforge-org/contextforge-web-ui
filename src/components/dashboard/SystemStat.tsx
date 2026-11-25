/**
 * Shared stat primitives for the System home view.
 *
 * - `StatBlock` stacks a muted label over its value (top System card).
 * - `StatRow` places a muted label on the left and its value on the right
 *   (Virtual servers + Components & ecosystem cards).
 *
 * Values are pre-formatted strings (see `systemMetrics.ts`); these components
 * never derive presentation from raw numbers. A `loading` flag renders a
 * skeleton in the value slot so the layout does not shift when data arrives.
 *
 * ARIA ignores `aria-label` on a span, so `StatValue` names the `UNAVAILABLE`
 * em dash with a visually-hidden sibling.
 */

import type { ReactNode } from "react";
import { useIntl } from "react-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { UNAVAILABLE } from "./systemMetrics";

function StatValue({ value }: { value: ReactNode }) {
  const intl = useIntl();
  if (value !== UNAVAILABLE) return <>{value}</>;
  return (
    <>
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{intl.formatMessage({ id: "common.unavailable" })}</span>
    </>
  );
}

interface StatBlockProps {
  label: ReactNode;
  value: ReactNode;
  loading?: boolean;
}

export function StatBlock({ label, value, loading }: StatBlockProps) {
  const unavailable = value === UNAVAILABLE;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-4 w-16" />
      ) : (
        <span
          className={cn(
            "text-xs leading-4 tabular-nums",
            unavailable ? "font-light text-muted-foreground" : "font-normal text-foreground",
          )}
        >
          <StatValue value={value} />
        </span>
      )}
    </div>
  );
}

interface StatRowProps {
  label: ReactNode;
  value: ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatRow({ label, value, loading, className }: StatRowProps) {
  const unavailable = value === UNAVAILABLE;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <span className="text-sm leading-4 text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-4 w-12" />
      ) : (
        <span
          className={cn(
            "text-sm leading-4 tabular-nums",
            unavailable
              ? "font-light text-muted-foreground"
              : "font-normal text-secondary-foreground",
          )}
        >
          <StatValue value={value} />
        </span>
      )}
    </div>
  );
}
