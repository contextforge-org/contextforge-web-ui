import { useState, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Loader2 } from "lucide-react";
import { AgentIcon } from "@/components/icons/AgentIcon";
import { Button } from "@/components/ui/button";
import { ExpandableSection } from "@/components/ui/expandable-section";
import { Field } from "@/components/ui/field";
import { FormInput } from "@/components/ui/form-input";

export function StepHeader({ title, badge }: { title: string; badge?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-agent-icon-bg">
        <AgentIcon className="h-3.5 w-3.5 text-black" aria-hidden="true" />
      </div>
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h2>
      {badge}
    </div>
  );
}

/** A collapsed section for the optional details of a step. */
export function ViewMore({ children }: { children: ReactNode }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  return (
    <ExpandableSection
      label={intl.formatMessage({ id: "agents.connect.viewMore" })}
      open={open}
      onOpenChange={setOpen}
    >
      {children}
    </ExpandableSection>
  );
}

export function FormActions({
  onCancel,
  onContinue,
  continueLabel,
  isBusy = false,
  continueDisabled = false,
}: {
  onCancel: () => void;
  onContinue: () => void;
  continueLabel: string;
  isBusy?: boolean;
  continueDisabled?: boolean;
}) {
  const intl = useIntl();
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isBusy}>
        {intl.formatMessage({ id: "common.button.cancel" })}
      </Button>
      <Button
        type="submit"
        size="sm"
        onClick={onContinue}
        disabled={isBusy || continueDisabled}
        aria-busy={isBusy}
      >
        {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {continueLabel}
      </Button>
    </div>
  );
}

/** A red box for a failure that is not tied to one field, such as a rejected registration. */
export function SubmitError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/50"
    >
      <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
    </div>
  );
}

/** A labelled single-line input with the form's standard styling. */
export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  error,
  info,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  error?: string;
  info?: string;
}) {
  return (
    <Field
      id={id}
      label={label}
      required={required}
      error={error}
      info={info}
      labelProps={info ? { className: "inline-flex items-center gap-0.5" } : undefined}
    >
      {(controlProps) => (
        <FormInput
          {...controlProps}
          type={type}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </Field>
  );
}
