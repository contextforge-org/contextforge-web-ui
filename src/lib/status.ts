import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Canonical status severities — the four-icon set defined in ui/sonner.tsx.
 * Consume STATUS_ICON / STATUS_TONE_CLASS instead of picking a status icon or
 * color ad hoc, so success/info/warning/error stay a single glyph and color
 * app-wide (see issue #62).
 */
export type StatusSeverity = "success" | "info" | "warning" | "error";

export const STATUS_ICON: Record<StatusSeverity, LucideIcon> = {
  success: CircleCheckIcon,
  info: InfoIcon,
  warning: TriangleAlertIcon,
  error: OctagonXIcon,
};

export const STATUS_TONE_CLASS: Record<StatusSeverity, string> = {
  success: "text-success",
  info: "text-muted-foreground",
  warning: "text-warning",
  error: "text-destructive",
};
