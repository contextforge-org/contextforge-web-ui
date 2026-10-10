import { useCallback, useId, useMemo } from "react";
import { useIntl } from "react-intl";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PromptArgument } from "@/generated/types";

export interface PromptArgsFormProps {
  args: Record<string, string>;
  schema: (PromptArgument | null)[];
  onChange: (next: Record<string, string>) => void;
}

function toPlaceholder(description?: string | null): string {
  if (!description) return "";
  const trimmed = description.trim();
  if (!trimmed) return "";
  const egMatch = trimmed.match(/\be\.g\..*/i);
  if (!egMatch) {
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  }
  const startIdx = egMatch.index ?? 0;
  let extracted = egMatch[0];
  // When "e.g." sits inside a parenthetical, extract only up to the matching
  // close-paren so the closing bracket doesn't leak into the placeholder.
  if (startIdx > 0 && trimmed[startIdx - 1] === "(") {
    let depth = 1;
    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          extracted = trimmed.slice(startIdx, i);
          break;
        }
      }
    }
  }
  extracted = extracted.trim();
  return extracted.charAt(0).toLowerCase() + extracted.slice(1);
}

/**
 * Renders one input per declared prompt argument. Pure controlled component —
 * holds no state of its own. Parent owns the args record and replaces it on
 * every change.
 */
export function PromptArgsForm({ args, schema, onChange }: PromptArgsFormProps) {
  const intl = useIntl();
  const fieldIdPrefix = useId();

  const declared = useMemo(
    () => schema.filter((entry): entry is NonNullable<PromptArgument> => Boolean(entry)),
    [schema],
  );

  const handleChange = useCallback(
    (name: string, value: string) => {
      onChange({ ...args, [name]: value });
    },
    [args, onChange],
  );

  if (declared.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">
        {intl.formatMessage({ id: "prompts.details.code.args.heading" })}
      </h4>
      <div className="space-y-3">
        {declared.map((arg) => {
          const fieldId = `${fieldIdPrefix}-${arg.name}`;
          const required = Boolean(arg.required);
          return (
            <Field
              key={arg.name}
              id={fieldId}
              label={arg.name}
              required={required}
              labelProps={{ className: "font-mono text-[12px] text-foreground" }}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  value={args[arg.name] ?? ""}
                  onChange={(event) => handleChange(arg.name, event.target.value)}
                  placeholder={toPlaceholder(arg.description)}
                  required={required}
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
