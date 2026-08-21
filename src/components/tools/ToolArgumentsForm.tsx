import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ToolArgumentsFormProps {
  schema: Record<string, unknown> | null | undefined;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onValidityChange?: (valid: boolean) => void;
}

export interface FieldSpec {
  path: string[];
  name: string;
  label: string;
  description?: string;
  required: boolean;
  parentRequired?: boolean;
  type: "string" | "number" | "integer" | "boolean" | "enum" | "array";
  enumValues?: string[];
  format?: string;
  itemType?: "string" | "number" | "integer" | "boolean";
}

export interface FormSpec {
  complex: boolean;
  fields: FieldSpec[];
}

const COMPLEX_KEYS = ["$ref", "oneOf", "anyOf", "allOf", "not"];
const SUPPORTED_PRIMITIVES = new Set(["string", "number", "integer", "boolean"]);

export function seedToolArguments(schema: Record<string, unknown> | null | undefined) {
  const spec = buildFormSpec(schema);
  if (spec.complex) return {};
  const next: Record<string, unknown> = {};
  for (const field of spec.fields) {
    setPathValue(next, field.path, defaultValueForField(field));
  }
  return stripEmptyOptionalValues(next, spec.fields);
}

export function buildFormSpec(schema: Record<string, unknown> | null | undefined): FormSpec {
  if (!schema || Object.keys(schema).length === 0) return { complex: false, fields: [] };
  if (hasComplexKeys(schema)) return { complex: true, fields: [] };

  const rootType = getSchemaType(schema);
  if (rootType && rootType !== "object") return { complex: true, fields: [] };

  const properties = asRecord(schema.properties);
  const required = new Set(asStringArray(schema.required));
  if (!properties) return { complex: false, fields: [] };

  const fields: FieldSpec[] = [];
  for (const [name, childSchema] of Object.entries(properties)) {
    const child = asRecord(childSchema);
    if (!child || hasComplexKeys(child)) return { complex: true, fields: [] };
    const childType = getSchemaType(child);
    if (childType === "object") {
      const nested = asRecord(child.properties);
      if (!nested || hasComplexKeys(child)) return { complex: true, fields: [] };
      const nestedRequired = new Set(asStringArray(child.required));
      const parentRequired = required.has(name);
      for (const [nestedName, nestedSchema] of Object.entries(nested)) {
        const nestedChild = asRecord(nestedSchema);
        if (!nestedChild || hasComplexKeys(nestedChild)) return { complex: true, fields: [] };
        const field = buildFieldSpec(
          nestedName,
          nestedChild,
          parentRequired && nestedRequired.has(nestedName),
          [name, nestedName],
        );
        if (!field) return { complex: true, fields: [] };
        fields.push({ ...field, label: `${name}.${nestedName}`, parentRequired });
      }
      continue;
    }

    const field = buildFieldSpec(name, child, required.has(name), [name]);
    if (!field) return { complex: true, fields: [] };
    fields.push(field);
  }

  return { complex: false, fields };
}

export function validateToolArguments(
  value: Record<string, unknown>,
  fields: FieldSpec[],
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const current = getPathValue(value, field.path);
    const empty =
      current === undefined ||
      current === null ||
      current === "" ||
      (Array.isArray(current) && current.length === 0);

    if (field.required && empty) {
      errors[field.path.join(".")] = "required";
      continue;
    }
    if (empty) continue;
    if (field.type === "integer" && !Number.isInteger(current)) {
      errors[field.path.join(".")] = "integer";
    }
    if (field.type === "number" && (typeof current !== "number" || !Number.isFinite(current))) {
      errors[field.path.join(".")] = "number";
    }
  }

  return errors;
}

export function ToolArgumentsForm({
  schema,
  value,
  onChange,
  onValidityChange,
}: ToolArgumentsFormProps) {
  const intl = useIntl();
  const spec = useMemo(() => buildFormSpec(schema), [schema]);
  const [rawJson, setRawJson] = useState(() => JSON.stringify(value, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [arrayDrafts, setArrayDrafts] = useState<Record<string, string>>({});
  const errors = useMemo(
    () => (spec.complex ? {} : validateToolArguments(value, spec.fields)),
    [spec, value],
  );

  useEffect(() => {
    if (spec.complex) {
      setRawJson(JSON.stringify(value, null, 2));
      setRawError(null);
    }
  }, [spec.complex, value]);

  useEffect(() => {
    onValidityChange?.(spec.complex ? rawError === null : Object.keys(errors).length === 0);
  }, [errors, onValidityChange, rawError, spec.complex]);

  const updateField = (field: FieldSpec, nextValue: unknown) => {
    const next = cloneWithPathValue(value, field.path, nextValue);
    onChange(stripEmptyOptionalValues(next, spec.fields));
  };

  const updateArrayField = (field: FieldSpec, rawValue: string) => {
    const key = field.path.join(".");
    setArrayDrafts((current) => ({ ...current, [key]: rawValue }));
    updateField(field, parseFieldValue(field, rawValue));
  };

  if (spec.complex) {
    return (
      <section className="space-y-3" aria-labelledby="tool-preview-args-heading">
        <div className="flex flex-wrap items-center gap-2">
          <h4 id="tool-preview-args-heading" className="text-sm font-semibold text-foreground">
            {intl.formatMessage({ id: "tools.details.preview.arguments.title" })}
          </h4>
          <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
            {intl.formatMessage({ id: "tools.details.preview.arguments.complexBadge" })}
          </Badge>
        </div>
        <Textarea
          value={rawJson}
          aria-invalid={rawError !== null}
          aria-label={intl.formatMessage({ id: "tools.details.preview.arguments.rawJson" })}
          className="min-h-[180px] font-mono text-[12px]"
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            const next = event.target.value;
            setRawJson(next);
            try {
              const parsed = JSON.parse(next);
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                setRawError(
                  intl.formatMessage({ id: "tools.details.preview.arguments.error.object" }),
                );
                return;
              }
              setRawError(null);
              onChange(parsed as Record<string, unknown>);
            } catch {
              setRawError(intl.formatMessage({ id: "tools.details.preview.arguments.error.json" }));
            }
          }}
        />
        {rawError && (
          <p className="text-[12px] leading-4 text-destructive" role="alert">
            {rawError}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="tool-preview-args-heading">
      <div>
        <h4 id="tool-preview-args-heading" className="text-sm font-semibold text-foreground">
          {intl.formatMessage({ id: "tools.details.preview.arguments.title" })}
        </h4>
        {spec.fields.length === 0 && (
          <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
            {intl.formatMessage({ id: "tools.details.preview.arguments.empty" })}
          </p>
        )}
      </div>

      {spec.fields.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {spec.fields.map((field) => {
            const key = field.path.join(".");
            const error = errors[key];
            return (
              <div key={key} className={cn("space-y-1.5", field.type === "boolean" && "pt-6")}>
                <FieldControl
                  field={field}
                  value={
                    field.type === "array"
                      ? (arrayDrafts[key] ?? arrayValueToString(getPathValue(value, field.path)))
                      : getPathValue(value, field.path)
                  }
                  error={error}
                  onChange={(next) => updateField(field, next)}
                  onArrayTextChange={
                    field.type === "array" ? (next) => updateArrayField(field, next) : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FieldControl({
  field,
  value,
  error,
  onChange,
  onArrayTextChange,
}: {
  field: FieldSpec;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onArrayTextChange?: (value: string) => void;
}) {
  const intl = useIntl();
  const id = `tool-arg-${field.path.join("-")}`;
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const commonLabel = (
    <Label htmlFor={id} className="text-[13px]">
      {field.label}
      {field.required && <span className="ml-1 text-destructive">*</span>}
    </Label>
  );

  if (field.type === "boolean") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {commonLabel}
        </div>
        <FieldMeta field={field} id={descriptionId} error={error} errorId={errorId} />
      </div>
    );
  }

  if (field.type === "enum" && field.enumValues) {
    return (
      <>
        {commonLabel}
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
            <SelectValue
              placeholder={intl.formatMessage({
                id: "tools.details.preview.arguments.selectPlaceholder",
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {field.enumValues.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldMeta field={field} id={descriptionId} error={error} errorId={errorId} />
      </>
    );
  }

  const inputType =
    field.type === "number" || field.type === "integer"
      ? "number"
      : field.format === "email"
        ? "email"
        : field.format === "date"
          ? "date"
          : field.format === "date-time"
            ? "datetime-local"
            : "text";
  const currentValue = value === undefined || value === null ? "" : String(value);

  return (
    <>
      {commonLabel}
      <Input
        id={id}
        type={inputType}
        value={currentValue}
        aria-invalid={Boolean(error)}
        aria-describedby={[field.description ? descriptionId : null, error ? errorId : null]
          .filter(Boolean)
          .join(" ")}
        placeholder={
          field.type === "array"
            ? intl.formatMessage({ id: "tools.details.preview.arguments.arrayPlaceholder" })
            : undefined
        }
        step={field.type === "integer" ? 1 : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          field.type === "array"
            ? onArrayTextChange?.(event.target.value)
            : onChange(parseFieldValue(field, event.target.value))
        }
      />
      <FieldMeta field={field} id={descriptionId} error={error} errorId={errorId} />
    </>
  );
}

function FieldMeta({
  field,
  id,
  error,
  errorId,
}: {
  field: FieldSpec;
  id: string;
  error?: string;
  errorId: string;
}) {
  const intl = useIntl();
  return (
    <>
      {field.description && (
        <p id={id} className="text-[12px] leading-4 text-muted-foreground">
          {field.description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[12px] leading-4 text-destructive" role="alert">
          {intl.formatMessage({
            id:
              error === "required"
                ? "tools.details.preview.arguments.error.required"
                : error === "integer"
                  ? "tools.details.preview.arguments.error.integer"
                  : "tools.details.preview.arguments.error.number",
          })}
        </p>
      )}
    </>
  );
}

function buildFieldSpec(
  name: string,
  schema: Record<string, unknown>,
  required: boolean,
  path: string[],
): FieldSpec | null {
  const enumValues = asStringArray(schema.enum);
  if (enumValues.length > 0) {
    return {
      path,
      name,
      label: name,
      required,
      type: "enum",
      enumValues,
      description: typeof schema.description === "string" ? schema.description : undefined,
      format: typeof schema.format === "string" ? schema.format : undefined,
    };
  }

  const type = getSchemaType(schema);
  if (type === "array") {
    const items = asRecord(schema.items);
    const itemType = items ? getSchemaType(items) : null;
    if (!itemType || !SUPPORTED_PRIMITIVES.has(itemType)) return null;
    return {
      path,
      name,
      label: name,
      required,
      type: "array",
      itemType: itemType as FieldSpec["itemType"],
      description: typeof schema.description === "string" ? schema.description : undefined,
    };
  }

  if (!type || !SUPPORTED_PRIMITIVES.has(type)) return null;
  return {
    path,
    name,
    label: name,
    required,
    type: type as FieldSpec["type"],
    description: typeof schema.description === "string" ? schema.description : undefined,
    format: typeof schema.format === "string" ? schema.format : undefined,
  };
}

function parseFieldValue(field: FieldSpec, value: string): unknown {
  if (field.type === "number" || field.type === "integer") {
    return value === "" ? "" : Number(value);
  }
  if (field.type === "array") {
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (field.itemType === "number" || field.itemType === "integer") {
      return parts.map((part) => Number(part)).filter((part) => !Number.isNaN(part));
    }
    if (field.itemType === "boolean") {
      return parts.map((part) => part.toLowerCase() === "true");
    }
    return parts;
  }
  return value;
}

function arrayValueToString(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

function defaultValueForField(field: FieldSpec): unknown {
  if (field.type === "boolean") return false;
  if (field.type === "array") return [];
  return "";
}

function stripEmptyOptionalValues(
  value: Record<string, unknown>,
  fields: FieldSpec[],
): Record<string, unknown> {
  const next = structuredCloneSafe(value);
  for (const field of fields) {
    if (field.required) continue;
    const current = getPathValue(next, field.path);
    const empty =
      current === "" ||
      current === undefined ||
      current === null ||
      (Array.isArray(current) && current.length === 0);
    if (empty) {
      deletePathValue(next, field.path, { pruneEmptyParents: field.parentRequired === false });
    }
  }
  return next;
}

function getSchemaType(schema: Record<string, unknown>): string | null {
  if (typeof schema.type === "string") return schema.type;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function hasComplexKeys(value: Record<string, unknown>): boolean {
  return COMPLEX_KEYS.some((key) => key in value);
}

function getPathValue(value: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function cloneWithPathValue(
  value: Record<string, unknown>,
  path: string[],
  nextValue: unknown,
): Record<string, unknown> {
  const next = structuredCloneSafe(value);
  setPathValue(next, path, nextValue);
  return next;
}

function setPathValue(value: Record<string, unknown>, path: string[], nextValue: unknown): void {
  let current = value;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      current[segment] = nextValue;
      return;
    }
    const child = current[segment];
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  });
}

function deletePathValue(
  value: Record<string, unknown>,
  path: string[],
  options: { pruneEmptyParents?: boolean } = {},
): void {
  let current = value;
  const parents: Array<{ parent: Record<string, unknown>; segment: string }> = [];
  for (const segment of path.slice(0, -1)) {
    const child = current[segment];
    if (!child || typeof child !== "object" || Array.isArray(child)) return;
    parents.push({ parent: current, segment });
    current = child as Record<string, unknown>;
  }
  delete current[path[path.length - 1]];

  if (!options.pruneEmptyParents) return;
  for (const { parent, segment } of parents.reverse()) {
    const child = parent[segment];
    if (!child || typeof child !== "object" || Array.isArray(child)) return;
    if (Object.keys(child).length > 0) return;
    delete parent[segment];
  }
}

function structuredCloneSafe(value: Record<string, unknown>): Record<string, unknown> {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
