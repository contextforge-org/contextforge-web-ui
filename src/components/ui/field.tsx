import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  /** `id` that links the label to its control via `htmlFor`. */
  id: string;
  label: React.ReactNode;
  /** Optional help text shown below the control. */
  hint?: React.ReactNode;
  /** Validation message; when present the error colour applies. */
  error?: string;
  /** The control (Input, SelectTrigger, Textarea, …). */
  children: React.ReactNode;
  className?: string;
  /** Additional props forwarded to the label. */
  labelProps?: React.ComponentPropsWithoutRef<typeof Label>;
}

/**
 * Standardised field layout: label -> control -> hint/error.
 * Defines the label-to-control gap once so forms don't diverge.
 */
function Field({ id, label, hint, error, children, className, labelProps }: FieldProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("space-y-2.5", className)}>
      <Label htmlFor={id} {...labelProps}>
        {label}
      </Label>
      {/* Clone the control to inject aria-describedby / aria-invalid from the error state. */}
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          "aria-describedby":
            errorId ?? (child.props as Record<string, unknown>)["aria-describedby"],
          "aria-invalid": error ? true : (child.props as Record<string, unknown>)["aria-invalid"],
        });
      })}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { Field };
