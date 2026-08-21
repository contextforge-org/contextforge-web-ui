import { useIntl } from "react-intl";
import { Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ResourcePreviewState } from "./useResourcePreview";

export interface ResourcePreviewButtonProps {
  preview: Pick<ResourcePreviewState, "run" | "isLoading" | "hasRun">;
  /**
   * True when a required uriTemplate placeholder is still empty, so the
   * resolved URI can't be sent yet (e.g. `github://repos//` for an unfilled
   * `{repo}`). Blocks the click in addition to the `isLoading` guard.
   */
  disabled?: boolean;
}

/**
 * The Preview / Re-run / Rendering trigger. Kept separate from the response
 * components so it can live on the snippet-tab row while the status and
 * rendered content render below. Near-verbatim copy of `PromptPreviewButton`
 * — domain-neutral already, duplicated rather than shared.
 */
export function ResourcePreviewButton({ preview, disabled = false }: ResourcePreviewButtonProps) {
  const intl = useIntl();
  const { run, isLoading, hasRun } = preview;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={run}
      disabled={isLoading || disabled}
    >
      {isLoading ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          {intl.formatMessage({ id: "resources.details.preview.running" })}
        </>
      ) : hasRun ? (
        intl.formatMessage({ id: "resources.details.preview.rerun" })
      ) : (
        <>
          <Play className="size-3.5" />
          {intl.formatMessage({ id: "resources.details.preview.run" })}
        </>
      )}
    </Button>
  );
}
