import { useRef, type RefObject } from "react";
import { useIntl } from "react-intl";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";

interface TokenCreatedDialogProps {
  /** The raw access token to reveal, or null when the dialog is closed. */
  token: string | null;
  onClose: () => void;
  /**
   * Element to focus once the dialog closes. Radix normally restores focus to
   * whatever was focused when the dialog mounted, but the submit button that
   * triggered this dialog unmounts in the same commit that opens it (the create
   * form is replaced by the list), so there is nothing left to restore to and
   * focus would fall back to `<body>`.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * One-time reveal of a freshly created token. The raw secret is only returned by
 * the create call and can never be retrieved again, so the dialog leads with
 * that warning and offers a copy affordance. Closing discards the value.
 */
export function TokenCreatedDialog({ token, onClose, returnFocusRef }: TokenCreatedDialogProps) {
  const intl = useIntl();
  const isOpen = token !== null;
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="gap-6 sm:max-w-xl"
        onOpenAutoFocus={(event) => {
          // Radix would otherwise auto-focus the first focusable descendant,
          // the copy button — whose tooltip opens on focus and would eat the
          // first Escape press instead of the dialog. Focus Close instead.
          event.preventDefault();
          closeButtonRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current;
          if (!target) return; // No target: leave Radix's default restore alone.
          event.preventDefault();
          target.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl leading-snug">
            {intl.formatMessage({ id: "tokens.created.title" })}
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-medium text-foreground">
            {intl.formatMessage({ id: "tokens.created.label" })}
          </p>
          <div className="flex w-full items-center gap-2 rounded-lg border border-input px-4 py-3">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{token ?? ""}</span>
            <CopyButton
              value={token ?? ""}
              label={intl.formatMessage(
                { id: "common.copyValue" },
                { label: intl.formatMessage({ id: "tokens.created.label" }) },
              )}
              className="size-5 shrink-0 text-muted-foreground"
            />
          </div>
        </div>
        <DialogFooter>
          <Button ref={closeButtonRef} onClick={onClose}>
            {intl.formatMessage({ id: "tokens.created.close" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
