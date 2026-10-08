import { useCallback, useId } from "react";
import { useIntl } from "react-intl";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface ResourceArgsFormProps {
  args: Record<string, string>;
  /** Placeholder names parsed from the resource's `uriTemplate`. */
  placeholders: string[];
  onChange: (next: Record<string, string>) => void;
}

/**
 * Renders one required input per URI-template placeholder
 * (`parseUriTemplate.parseUriTemplatePlaceholders`). Adapted from
 * `PromptArgsForm`: every placeholder is required (unlike prompt
 * arguments, which declare their own `required` flag) since an unfilled
 * placeholder can't produce a resolvable URI. Pure controlled component —
 * holds no state of its own.
 */
export function ResourceArgsForm({ args, placeholders, onChange }: ResourceArgsFormProps) {
  const intl = useIntl();
  const fieldIdPrefix = useId();

  const handleChange = useCallback(
    (name: string, value: string) => {
      onChange({ ...args, [name]: value });
    },
    [args, onChange],
  );

  if (placeholders.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">
        {intl.formatMessage({ id: "resources.details.code.args.heading" })}
      </h4>
      <div className="space-y-3">
        {placeholders.map((name) => {
          const fieldId = `${fieldIdPrefix}-${name}`;
          return (
            <Field
              key={name}
              id={fieldId}
              label={name}
              required
              labelProps={{ className: "font-mono text-[12px] text-foreground" }}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={args[name] ?? ""}
                  onChange={(event) => handleChange(name, event.target.value)}
                  required
                  className="placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                />
              )}
            </Field>
          );
        })}
      </div>
    </div>
  );
}
