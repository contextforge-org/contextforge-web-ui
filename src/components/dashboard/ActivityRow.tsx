/**
 * ActivityRow — one entry in the Recent Activity feed.
 *
 * `title` and `description` are server-rendered (see `types/activity.ts`): the
 * UI must not re-derive either from the other fields. Timestamps render
 * relative ("6 minutes ago") with the absolute ISO value in `title` for hover,
 * per the feed spike.
 *
 * The status glyph is decorative; the status is exposed to assistive tech as
 * visually-hidden text instead, so the row reads as "Error — <title>".
 */

import { useIntl } from "react-intl";

import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/types/activity";
import { formatLastSeen } from "@/utils/format";

import { ACTIVITY_STATUS_STYLE } from "./activityStatus";

export function ActivityRow({ item }: { item: ActivityItem }) {
  const intl = useIntl();
  const { Icon, className, labelId } = ACTIVITY_STATUS_STYLE[item.status];
  const relative = formatLastSeen(item.timestamp, { locale: intl.locale });

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
      <span className="sr-only">{intl.formatMessage({ id: labelId })}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground">{item.title}</p>
        <p className="text-xxs font-medium text-muted-foreground">{item.description}</p>
      </div>
      {relative && (
        <time
          dateTime={item.timestamp}
          title={item.timestamp}
          className="shrink-0 text-xxs font-medium text-muted-foreground"
        >
          {relative}
        </time>
      )}
    </li>
  );
}
