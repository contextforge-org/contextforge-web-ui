import type { ToolPreviewResponse, ToolResultContentBlock, ToolResultResource } from "@/api/tools";
import type { CodeBlockLanguage } from "@/components/ui/code-block";

export const TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES = 256 * 1024;
export const TOOL_RESULT_TOTAL_SIZE_LIMIT_BYTES = 512 * 1024;
export const TOOL_RESULT_BLOCK_COUNT_LIMIT = 20;
export const TOOL_RESULT_STRUCTURED_OUTPUT_SIZE_LIMIT_BYTES = 256 * 1024;

const DEFAULT_MIME_TYPE = "application/octet-stream";

export interface NormalizedToolContentBlock {
  type: string;
  mimeType: string;
  text?: string;
  data?: string;
  uri?: string;
  raw: ToolResultContentBlock | string;
  byteSize: number;
  isLarge: boolean;
}

export type ToolCodeLanguage = CodeBlockLanguage;

export interface ToolResultBlockWindow {
  visibleBlocks: NormalizedToolContentBlock[];
  hiddenBlockCount: number;
  totalByteSize: number;
  isLimited: boolean;
}

export function getToolResultContentBlocks(
  response: ToolPreviewResponse,
): NormalizedToolContentBlock[] {
  const payload = getToolResultPayload(response);
  const content = payload.content;
  if (!Array.isArray(content)) return [];

  return content
    .map((block) => normalizeToolContentBlock(block))
    .filter((block): block is NormalizedToolContentBlock => block !== null);
}

export function getToolStructuredOutput(response: ToolPreviewResponse): unknown {
  const payload = getToolResultPayload(response);
  if (hasOwn(payload, "structured_output")) return payload.structured_output;
  if (hasOwn(payload, "structuredOutput")) return payload.structuredOutput;
  return undefined;
}

export function getToolResultIsError(response: ToolPreviewResponse): boolean {
  const payload = getToolResultPayload(response);
  return payload.isError === true || payload.is_error === true;
}

export function isTextualMime(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) return false;
  return (
    normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("xml") ||
    normalized === "application/javascript" ||
    normalized === "application/x-yaml" ||
    normalized === "application/yaml"
  );
}

export function codeLanguageForMime(mimeType: string): ToolCodeLanguage {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("json")) return "json";
  if (normalized.includes("xml")) return "xml";
  if (normalized.includes("markdown") || normalized.includes("md")) return "markdown";
  return "text";
}

export function formatToolResultBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTextForMime(text: string, mimeType: string): string {
  if (!mimeType.toLowerCase().includes("json")) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function getDataUrl(block: NormalizedToolContentBlock): string | null {
  if (block.data !== undefined) {
    if (block.data.startsWith("data:")) return block.data;
    return `data:${block.mimeType};base64,${block.data}`;
  }

  if (block.text !== undefined) {
    return `data:${block.mimeType};charset=utf-8,${encodeURIComponent(block.text)}`;
  }

  return null;
}

export function getToolResultBlockWindow(
  blocks: NormalizedToolContentBlock[],
  limits: {
    maxBlocks?: number;
    maxTotalBytes?: number;
  } = {},
): ToolResultBlockWindow {
  const maxBlocks = limits.maxBlocks ?? TOOL_RESULT_BLOCK_COUNT_LIMIT;
  const maxTotalBytes = limits.maxTotalBytes ?? TOOL_RESULT_TOTAL_SIZE_LIMIT_BYTES;
  const totalByteSize = blocks.reduce((total, block) => total + block.byteSize, 0);
  const visibleBlocks: NormalizedToolContentBlock[] = [];
  let visibleByteSize = 0;

  for (const block of blocks) {
    if (visibleBlocks.length >= maxBlocks) break;
    if (visibleBlocks.length > 0 && visibleByteSize + block.byteSize > maxTotalBytes) break;
    visibleBlocks.push(block);
    visibleByteSize += block.byteSize;
  }

  return {
    visibleBlocks,
    hiddenBlockCount: blocks.length - visibleBlocks.length,
    totalByteSize,
    isLimited: visibleBlocks.length < blocks.length,
  };
}

export function estimateJsonByteSize(value: unknown, byteLimit = Infinity): number {
  const seen = new WeakSet<object>();
  let total = 0;

  function add(text: string) {
    total += getStringByteSize(text);
  }

  function visit(current: unknown) {
    if (total > byteLimit) return;

    if (current === null) {
      add("null");
      return;
    }

    switch (typeof current) {
      case "string":
        add(JSON.stringify(current));
        return;
      case "number":
      case "boolean":
        add(String(current));
        return;
      case "undefined":
      case "function":
      case "symbol":
        add("null");
        return;
      case "object":
        break;
    }

    if (seen.has(current)) {
      add('"[Circular]"');
      return;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      add("[");
      current.forEach((item, index) => {
        if (index > 0) add(",");
        visit(item);
      });
      add("]");
      return;
    }

    add("{");
    let index = 0;
    for (const [key, item] of Object.entries(current)) {
      if (index > 0) add(",");
      add(JSON.stringify(key));
      add(":");
      visit(item);
      index += 1;
    }
    add("}");
  }

  visit(value);
  return total;
}

function getToolResultPayload(response: ToolPreviewResponse): Record<string, unknown> {
  if (isToolResultPayload(response)) return response;

  for (const key of ["result", "tool_result", "toolResult", "output"]) {
    const candidate = response[key];
    if (isRecord(candidate) && isToolResultPayload(candidate)) return candidate;
  }

  return response;
}

function isToolResultPayload(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.content) ||
    hasOwn(value, "structured_output") ||
    hasOwn(value, "structuredOutput") ||
    hasOwn(value, "isError") ||
    hasOwn(value, "is_error")
  );
}

function normalizeToolContentBlock(value: unknown): NormalizedToolContentBlock | null {
  if (typeof value === "string") {
    return buildNormalizedBlock({
      type: "text",
      mimeType: "text/plain",
      text: value,
      raw: value,
    });
  }

  if (!isRecord(value)) return null;

  const resource = isRecord(value.resource) ? (value.resource as ToolResultResource) : null;
  const type = pickString(value, "type") ?? inferType(value, resource);
  const mimeType =
    pickString(value, "mimeType", "mime_type", "mime") ?? pickMimeFromResource(resource);
  const text = pickString(value, "text", "content") ?? pickString(resource, "text");
  const data = pickString(value, "data", "blob") ?? pickString(resource, "data", "blob");
  const uri = pickString(value, "uri") ?? pickString(resource, "uri");

  return buildNormalizedBlock({
    type,
    mimeType: mimeType ?? inferMimeType(type, text),
    text,
    data,
    uri,
    raw: value,
  });
}

function buildNormalizedBlock(input: {
  type: string;
  mimeType: string;
  text?: string;
  data?: string;
  uri?: string;
  raw: ToolResultContentBlock | string;
}): NormalizedToolContentBlock {
  const byteSize = getBlockByteSize(input);
  return {
    ...input,
    byteSize,
    isLarge: byteSize > TOOL_RESULT_BLOCK_SIZE_LIMIT_BYTES,
  };
}

function getBlockByteSize(input: {
  text?: string;
  data?: string;
  raw: ToolResultContentBlock | string;
}): number {
  if (input.text !== undefined) return getStringByteSize(input.text);
  if (input.data !== undefined) return getDataByteSize(input.data);
  return getStringByteSize(JSON.stringify(input.raw));
}

function getStringByteSize(value: string | undefined): number {
  if (!value) return 0;
  return new Blob([value]).size;
}

function getDataByteSize(value: string): number {
  if (value.startsWith("data:")) {
    const commaIndex = value.indexOf(",");
    if (commaIndex === -1) return getStringByteSize(value);

    const metadata = value.slice(5, commaIndex).toLowerCase();
    const payload = value.slice(commaIndex + 1);
    if (metadata.split(";").includes("base64")) {
      return getBase64ByteSize(payload) ?? getStringByteSize(payload);
    }

    try {
      return getStringByteSize(decodeURIComponent(payload));
    } catch {
      return getStringByteSize(payload);
    }
  }

  return getBase64ByteSize(value) ?? getStringByteSize(value);
}

function getBase64ByteSize(value: string): number | null {
  const normalized = value.replace(/\s/g, "");
  if (normalized.length === 0) return 0;
  if (normalized.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function inferType(value: Record<string, unknown>, resource: ToolResultResource | null): string {
  if (pickString(value, "text", "content") || pickString(resource, "text")) return "text";
  if (pickString(value, "data", "blob") || pickString(resource, "data", "blob")) return "blob";
  if (resource) return "resource";
  return "unknown";
}

function inferMimeType(type: string, text: string | undefined): string {
  if (type === "text") return "text/plain";
  if (type === "image") return "image/png";
  if (text !== undefined) return "text/plain";
  return DEFAULT_MIME_TYPE;
}

function pickMimeFromResource(resource: ToolResultResource | null): string | undefined {
  return pickString(resource, "mimeType", "mime_type", "mime");
}

function pickString(value: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!value) return undefined;
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "string") return field;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
