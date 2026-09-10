import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Props Field computes for its control: id, invalid state, describedby chain. */
export interface FieldControlProps {
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

interface FieldProps {
  /** `id` that links the label to its control via `htmlFor`. */
  id: string;
  label: React.ReactNode;
  /** Optional help text shown below the control. */
  hint?: React.ReactNode;
  /** Validation message; when present the error colour applies. */
  error?: string;
  /** Render prop for the control; receives `id`/`aria-invalid`/`aria-describedby` to spread onto whichever element is DOM-facing (e.g. `SelectTrigger` inside `Select`). */
  children: (controlProps: FieldControlProps) => React.ReactNode;
  className?: string;
  /** Additional props forwarded to the label. `htmlFor` always comes from `id`. */
  labelProps?: Omit<React.ComponentPropsWithoutRef<typeof Label>, "htmlFor">;
}

/**
 * Standardised field layout: label -> control -> hint/error.
 * Defines the label-to-control gap once so forms don't diverge.
 */
function Field({ id, label, hint, error, children, className, labelProps }: FieldProps) {
  // Presence check, not truthiness: an explicit error="" still means invalid
  // (e.g. a message that hasn't resolved yet), so it must not be treated the
  // same as "no error" and silently drop aria-invalid/aria-describedby.
  const hasError = error !== undefined;
  const errorId = hasError ? `${id}-error` : undefined;
  const hintId = hint && !hasError ? `${id}-hint` : undefined;

  const controlProps: FieldControlProps = {
    id,
    "aria-invalid": hasError ? true : undefined,
    "aria-describedby": errorId ?? hintId,
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* labelProps spreads before htmlFor so it can never override which control this labels. */}
      <Label {...labelProps} htmlFor={id}>
        {label}
      </Label>
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
  );
}

export { Field };
