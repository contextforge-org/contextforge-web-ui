import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** The text input the add/connect forms use: square-ish corners, no shadow and a thin focus ring. */
const FORM_INPUT_CLASS =
  "rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500";

const FormInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn(FORM_INPUT_CLASS, className)} {...props} />
  ),
);

FormInput.displayName = "FormInput";

export { FormInput };
