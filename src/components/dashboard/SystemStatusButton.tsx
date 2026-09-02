/**
 * Entry point from the sparklines card into the System view (`/app/?view=system`).
 *
 * The default state has no System mini card, so this is the only route to it
 * from the resting home.
 */

import { SquareActivity } from "lucide-react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
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
      className={className}
      onClick={() => navigate(viewHref("system"))}
    >
      <span className="text-xs text-status-icon">
        {intl.formatMessage({ id: "dashboard.home.sparklines.systemStatus" })}
      </span>
      <SquareActivity className="size-3 text-status-icon" />
    </Button>
  );
}
