/**
 * RFC 6570-lite placeholder handling for resource URI templates (e.g.
 * `github://repos/{owner}/{repo}/contents/{path}`). Only plain
 * `{name}` expressions are supported — level-1 simple string expansion.
 * Reserved/fragment/query operators (`{+x}`, `{#x}`, `{?x}`, `{&x}`, `{;x}`,
 * `{.x}`, `{/x}`) and the explode modifier (`{x*}`) are recognized just
 * enough to extract the variable name; the operator/modifier themselves are
 * not honored during expansion. Sufficient for the placeholder shapes the
 * gateway's resource templates actually use.
 */
const PLACEHOLDER_PATTERN = /\{([+#./;?&]?)([a-zA-Z_][a-zA-Z0-9_]*)(\*)?\}/g;

/**
 * Extracts the ordered, de-duplicated list of placeholder names from a URI
 * template. Returns an empty array for a template with no placeholders (or
 * for `null`/`undefined`).
 */
export function parseUriTemplatePlaceholders(uriTemplate?: string | null): string[] {
  if (!uriTemplate) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of uriTemplate.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[2];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * Substitutes each `{name}` placeholder with the corresponding value,
 * producing the concrete URI to send to `resources/read` /
 * `GET /v1/resources/test/{uri}`. Missing values substitute as an empty
 * string — the caller (`ResourceArgsForm`) marks every placeholder required
 * so the Preview button stays disabled until all are filled.
 */
export function resolveUriTemplate(uriTemplate: string, values: Record<string, string>): string {
  return uriTemplate.replace(
    PLACEHOLDER_PATTERN,
    (_match, _operator, name: string) => values[name] ?? "",
  );
}
