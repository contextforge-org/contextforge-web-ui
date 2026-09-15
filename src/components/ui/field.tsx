import * as React from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Props Field computes for its control: id, invalid state, describedby chain. */
export interface FieldControlProps {
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

interface FieldProps {
  /** `id` that links the label to its control via `htmlFor`. */
  id: string;
  /** Plain text — never markup. Rich explanation belongs in `info`. */
  label: string;
  /**
   * Appends a "*" plus sr-only "(required)" text to the label, and sets
   * aria-required on the control. Pass a boolean expression (not just the
   * shorthand) for a field whose required-ness can flip at runtime — the
   * control's aria-required tracks it exactly, including `false`.
   */
  required?: boolean;
  /**
   * Explanatory content for an info-popover trigger shown beside the label.
   * Field owns the trigger/popover itself (not the caller) so the interactive
   * button is never nested inside the `<label>` element — a `<label>` lends
   * its text as the accessible name to any labelable descendant, so a
   * caller-supplied button in there would collide with its own aria-label.
   */
  info?: React.ReactNode;
  /** Optional help text shown below the control. */
  hint?: React.ReactNode;
  /** Validation message; when present the error colour applies. */
  error?: string;
  /** Render prop for the control; receives `id`/`aria-invalid`/`aria-describedby`/`aria-required` to spread onto whichever element is DOM-facing (e.g. `SelectTrigger` inside `Select`). */
  children: (controlProps: FieldControlProps) => React.ReactNode;
  className?: string;
  /** Additional props forwarded to the label. `htmlFor` always comes from `id`. */
  labelProps?: Omit<React.ComponentPropsWithoutRef<typeof Label>, "htmlFor">;
}

/**
 * Standardised field layout: label -> control -> hint/error.
 * Defines the label-to-control gap once so forms don't diverge.
 */
function Field({
  id,
  label,
  required,
  info,
  hint,
  error,
  children,
  className,
  labelProps,
}: FieldProps) {
  // Presence check, not truthiness: an explicit error="" still means invalid
  // (e.g. a message that hasn't resolved yet), so it must not be treated the
  // same as "no error" and silently drop aria-invalid/aria-describedby.
  const hasError = error !== undefined;
  const errorId = hasError ? `${id}-error` : undefined;
  const hintId = hint && !hasError ? `${id}-hint` : undefined;

  const controlProps: FieldControlProps = {
    id,
    "aria-invalid": hasError,
    "aria-describedby": errorId ?? hintId,
    "aria-required": required !== undefined ? required : undefined,
  };

  return (
    <div className={className}>
      {/* A bare <label> is inline, so its own margin-bottom has no layout
          effect — the gap has to live on this block-level wrapper instead. */}
      <div className={cn("mb-2.5", info && "flex items-center gap-1.5")}>
        {/* labelProps spreads before htmlFor so it can never override which control this labels. */}
        <Label {...labelProps} htmlFor={id}>
          {label}
          {required === true && (
            <>
              <span aria-hidden="true" className="text-destructive">
                {" "}
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          )}
        </Label>
        {info && (
          <Popover>
            <PopoverTrigger
              type="button"
              aria-label={`More info about ${label}`}
              className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent side="right" className="w-auto max-w-xs space-y-1 p-3 text-sm">
              {info}
            </PopoverContent>
          </Popover>
        )}
      </div>
      <div className="space-y-2.5">
        {children(controlProps)}
        {hintId && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {hasError && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export { Field };
