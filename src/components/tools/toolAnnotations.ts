export interface ToolAnnotationHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

const DEFAULT_HINTS: ToolAnnotationHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export function getToolAnnotationHints(
  annotations: Record<string, unknown> | null | undefined,
): ToolAnnotationHints {
  if (!annotations) return { ...DEFAULT_HINTS };

  return {
    readOnlyHint: toBooleanHint(annotations.readOnlyHint),
    destructiveHint: toBooleanHint(annotations.destructiveHint),
    idempotentHint: toBooleanHint(annotations.idempotentHint),
    openWorldHint: toBooleanHint(annotations.openWorldHint),
  };
}

function toBooleanHint(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}
