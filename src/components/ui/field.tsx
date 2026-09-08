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
  /**
   * The control. A single element (Input, Textarea) gets `id`/`aria-invalid`/
   * `aria-describedby` cloned onto it directly. For a composite control whose
   * DOM-facing node isn't the top-level child Field sees — e.g. `<Select>`,
   * whose child `<SelectTrigger>` is the one that actually needs the
   * attributes — pass a render function instead so the caller decides
   * exactly where they land.
   */
  children: React.ReactElement | ((controlProps: FieldControlProps) => React.ReactNode);
  className?: string;
  /** Additional props forwarded to the label. `htmlFor` always comes from `id`. */
  labelProps?: Omit<React.ComponentPropsWithoutRef<typeof Label>, "htmlFor">;
}

/**
 * Standardised field layout: label -> control -> hint/error.
 * Defines the label-to-control gap once so forms don't diverge.
 */
function Field({ id, label, hint, error, children, className, labelProps }: FieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  const controlProps: FieldControlProps = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": errorId ?? hintId,
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* labelProps spreads before htmlFor so it can never override which control this labels. */}
      <Label {...labelProps} htmlFor={id}>
        {label}
      </Label>
      {typeof children === "function"
        ? children(controlProps)
        : React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            ...controlProps,
            "aria-describedby":
              controlProps["aria-describedby"] ??
              (children.props as Record<string, unknown>)["aria-describedby"],
            "aria-invalid":
              controlProps["aria-invalid"] ??
              (children.props as Record<string, unknown>)["aria-invalid"],
          })}
      {hintId && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { Field };
