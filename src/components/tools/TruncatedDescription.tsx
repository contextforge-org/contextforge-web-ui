import { useState } from "react";
import { useIntl } from "react-intl";

/** Schema/tool descriptions are free text with no length limit, so a single
 * one can carry a long block of prose; clip it and let the user expand it in
 * place rather than pushing the rest of the layout down by default. */
export const DESCRIPTION_TRUNCATE_LENGTH = 180;

export interface TruncatedDescriptionProps {
  text: string;
  /** Applied to the wrapping `<p>`; also the id a "Show more" toggle points
   * `aria-controls` at, so pass one when the text needs to be referenced
   * (e.g. via `aria-describedby` on a related field). */
  id?: string;
  className?: string;
  maxLength?: number;
}

/**
 * Renders `text` clipped to `maxLength` characters with a trailing ellipsis,
 * plus an inline "Show more"/"Show less" toggle when it's actually longer
 * than that — shared by tool argument descriptions (`ToolArgumentsForm`) and
 * the tool description line (`ToolTryItTab`).
 */
export function TruncatedDescription({
  text,
  id,
  className,
  maxLength = DESCRIPTION_TRUNCATE_LENGTH,
}: TruncatedDescriptionProps) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const canTruncate = text.length > maxLength;
  const visibleText = canTruncate && !expanded ? `${text.slice(0, maxLength).trimEnd()}…` : text;

  return (
    <p id={id} className={className}>
      {visibleText}
      {canTruncate && (
        <>
          {" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((current) => !current)}
          >
            {intl.formatMessage({
              id: expanded
                ? "tools.details.preview.arguments.showLess"
                : "tools.details.preview.arguments.showMore",
            })}
          </button>
        </>
      )}
    </p>
  );
}
