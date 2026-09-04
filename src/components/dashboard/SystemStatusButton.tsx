/**
 * Entry point from the sparklines card into the System view (`/app/?view=system`).
 *
 * The default state has no System mini card, so this is the only route to it
 * from the resting home.
 */

import { SquareActivity } from "lucide-react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRouter } from "@/router";

import { viewHref } from "./homeStates";

export function SystemStatusButton({ className }: { className?: string }) {
  const intl = useIntl();
  const { navigate } = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      // --status-icon is cyan-500, which is only 2.43:1 on the white light-theme
      // background. cyan-700 matches the catalog link and clears AA; dark keeps
      // the brand cyan from the design.
      className={cn(
        "text-cyan-700 hover:text-cyan-800 dark:text-status-icon dark:hover:text-status-icon",
        className,
      )}
      onClick={() => navigate(viewHref("system"))}
    >
      <span className="text-xs">
        {intl.formatMessage({ id: "dashboard.home.sparklines.systemStatus" })}
      </span>
      <SquareActivity aria-hidden className="size-3" />
    </Button>
  );
}
