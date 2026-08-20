import { useEffect, type ChangeEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ToolHeaderRow {
  id: string;
  name: string;
  value: string;
}

export interface ToolHeadersEditorProps {
  rows: ToolHeaderRow[];
  onChange: (rows: ToolHeaderRow[]) => void;
  onValidityChange?: (valid: boolean) => void;
}

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DENIED_HEADERS = new Set([
  "authorization",
  "cookie",
  "forwarded",
  "x-real-ip",
  "x-csrf-token",
]);

export function createHeaderRow(): ToolHeaderRow {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `header-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "",
    value: "",
  };
}

export function getHeaderNameError(name: string): "invalid" | "denied" | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  if (!HEADER_NAME_PATTERN.test(name.trim())) return "invalid";
  if (DENIED_HEADERS.has(normalized) || normalized.startsWith("x-forwarded-")) return "denied";
  return null;
}

export function getForwardableHeaders(rows: ToolHeaderRow[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name || !row.value || getHeaderNameError(name)) continue;
    headers[name] = row.value;
  }
  return headers;
}

export function areHeaderRowsValid(rows: ToolHeaderRow[]): boolean {
  return rows.every((row) => getHeaderNameError(row.name) === null);
}

export function ToolHeadersEditor({ rows, onChange, onValidityChange }: ToolHeadersEditorProps) {
  const intl = useIntl();

  useEffect(() => {
    onValidityChange?.(areHeaderRowsValid(rows));
  }, [rows, onValidityChange]);

  const updateRow = (id: string, field: "name" | "value", value: string) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeRow = (id: string) => {
    onChange(rows.filter((row) => row.id !== id));
  };

  const addRow = () => {
    onChange([...rows, createHeaderRow()]);
  };

  return (
    <section className="space-y-3" aria-labelledby="tool-preview-headers-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 id="tool-preview-headers-heading" className="text-sm font-semibold text-foreground">
            {intl.formatMessage({ id: "tools.details.preview.headers.title" })}
          </h4>
          <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
            {intl.formatMessage({ id: "tools.details.preview.headers.description" })}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-3.5" />
          {intl.formatMessage({ id: "tools.details.preview.headers.add" })}
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const error = getHeaderNameError(row.name);
            const nameId = `tool-preview-header-name-${row.id}`;
            const valueId = `tool-preview-header-value-${row.id}`;
            const errorId = `tool-preview-header-error-${row.id}`;
            return (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2">
                  <div className="space-y-1">
                    <Label className="sr-only" htmlFor={nameId}>
                      {intl.formatMessage(
                        { id: "tools.details.preview.headers.nameLabel" },
                        { number: index + 1 },
                      )}
                    </Label>
                    <Input
                      id={nameId}
                      value={row.name}
                      placeholder={intl.formatMessage({
                        id: "tools.details.preview.headers.namePlaceholder",
                      })}
                      aria-invalid={error !== null}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateRow(row.id, "name", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="sr-only" htmlFor={valueId}>
                      {intl.formatMessage(
                        { id: "tools.details.preview.headers.valueLabel" },
                        { number: index + 1 },
                      )}
                    </Label>
                    <Input
                      id={valueId}
                      value={row.value}
                      placeholder={intl.formatMessage({
                        id: "tools.details.preview.headers.valuePlaceholder",
                      })}
                      type="password"
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateRow(row.id, "value", event.target.value)
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mt-0.5 size-8 text-muted-foreground"
                    aria-label={intl.formatMessage(
                      { id: "tools.details.preview.headers.remove" },
                      { number: index + 1 },
                    )}
                    onClick={() => removeRow(row.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {error && (
                  <p
                    id={errorId}
                    className={cn("text-[12px] leading-4 text-destructive")}
                    role="alert"
                  >
                    {intl.formatMessage({
                      id:
                        error === "denied"
                          ? "tools.details.preview.headers.error.denied"
                          : "tools.details.preview.headers.error.invalid",
                    })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
