/**
 * Activity status -> icon + tone.
 *
 * The canonical status set is the one `ui/sonner.tsx` already ships
 * (CircleCheck / Info / TriangleAlert / OctagonX). sonner is the reference
 * implementation; keeping the mapping in this single exported record is what
 * makes the app-wide token rollout (#62) a one-file change here rather than a
 * sweep through every row.
 *
 * `info` is deliberately unaccented. sonner gives it no per-status color (the
 * glyph inherits the toast foreground), and `info` covers high-volume
 * read/execute audit actions — muted-foreground lets those rows recede while
 * errors and warnings still carry.
 *
 * NOTE: `OctagonX` (octagon + x) diverges from the Figma spec's `octagon-alert`
 * (octagon + !) on purpose, matching the icon already shipping in sonner. Same
 * shape family. Do not "correct" it toward Figma without changing both.
 */

import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import type { ComponentType } from "react";

import type { ActivityStatus } from "@/types/activity";

export interface ActivityStatusStyle {
  Icon: ComponentType<{ className?: string }>;
  /** Text-color utility for the icon. */
  className: string;
  /** i18n message id for the screen-reader status label. */
  labelId: string;
}

export const ACTIVITY_STATUS_STYLE: Record<ActivityStatus, ActivityStatusStyle> = {
  success: {
    Icon: CircleCheckIcon,
    className: "text-green-500",
    labelId: "dashboard.home.activity.status.success",
  },
  info: {
    Icon: InfoIcon,
    className: "text-muted-foreground",
    labelId: "dashboard.home.activity.status.info",
  },
  warning: {
    Icon: TriangleAlertIcon,
    className: "text-yellow-500",
    labelId: "dashboard.home.activity.status.warning",
  },
  error: {
    Icon: OctagonXIcon,
    className: "text-destructive",
    labelId: "dashboard.home.activity.status.error",
  },
};
