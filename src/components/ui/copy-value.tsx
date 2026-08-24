import { useIntl } from "react-intl";

import { CopyButton } from "@/components/ui/copy-button";
import { TruncatedMiddleText } from "@/components/ui/truncated-middle-text";

export interface CopyValueProps {
  /** Human-readable name of the value, used to build the copy button's accessible label. */
  label: string;
  /** The full value copied to the clipboard (the visible text is middle-truncated). */
  value: string;
}

/**
 * A truncated, monospaced value paired with a copy-to-clipboard button.
 *
 * Shared across the entity detail panels (tools, resources, prompts, servers,
 * virtual servers). The visible text is middle-truncated for layout; the full
 * `value` is what gets copied. The copy button's accessible label is localized
 * via the `common.copyValue` message so screen readers announce it in the
 * active locale.
 */
export function CopyValue({ label, value }: CopyValueProps) {
  const intl = useIntl();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TruncatedMiddleText value={value} className="min-w-0 flex-1 font-mono text-[12px]" />
      <CopyButton
        value={value}
        label={intl.formatMessage({ id: "common.copyValue" }, { label })}
        className="size-5 text-muted-foreground"
      />
    </div>
  );
}
