import { useIntl } from "react-intl";
import { Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ToolPreviewState } from "@/hooks/useToolPreview";

export interface ToolPreviewButtonProps {
  preview: Pick<ToolPreviewState, "run" | "isLoading" | "hasRun">;
  disabled?: boolean;
}

export function ToolPreviewButton({ preview, disabled = false }: ToolPreviewButtonProps) {
  const intl = useIntl();
  const { run, isLoading, hasRun } = preview;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={run}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {intl.formatMessage({ id: "tools.details.preview.running" })}
        </>
      ) : hasRun ? (
        intl.formatMessage({ id: "tools.details.preview.rerun" })
      ) : (
        <>
          <Play className="size-3.5" />
          {intl.formatMessage({ id: "tools.details.preview.run" })}
        </>
      )}
    </Button>
  );
}
