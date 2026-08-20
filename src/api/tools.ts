/**
 * Tools API service
 */

import { api } from "./client";
import type { Tool } from "@/types/tool";
import type { GenerateSchemaRequest } from "@/generated/types/generateSchemaRequest";

/**
 * Request body for {@link toolsApi.generateSchemasFromOpenapi}.
 *
 * Re-exported from the generated OpenAPI client so the shape stays in lockstep
 * with the backend contract (`url`, optional `request_type`, optional
 * `openapi_url`).
 */
export type GenerateSchemasFromOpenapiInput = GenerateSchemaRequest;

/**
 * Response from `POST /v1/tools/generate-schemas-from-openapi`.
 *
 * The endpoint returns an untyped `JSONResponse` on the backend, so orval
 * generates only `data: unknown` for it; this narrows that shape by hand.
 */
export interface GenerateSchemasFromOpenapiResult {
  message: string;
  success: boolean;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
  spec_url: string;
  /** Set by the backend when the spec host requires authentication. */
  requires_auth?: boolean;
}

export interface ToolPreviewRequest {
  arguments: Record<string, unknown>;
}

export interface ToolPreviewWarning {
  code?: string;
  message?: string;
  hook?: string;
  hooks?: string[];
  [key: string]: unknown;
}

export interface ToolPreviewTarget {
  kind?: "local" | "federated" | string;
  gateway_name?: string | null;
  gatewayName?: string | null;
  name?: string | null;
  [key: string]: unknown;
}

export interface ToolResultResource {
  uri?: string;
  mimeType?: string;
  mime_type?: string;
  text?: string;
  blob?: string;
  data?: string;
  [key: string]: unknown;
}

export interface ToolResultContentBlock {
  type?: string;
  text?: string;
  data?: string;
  blob?: string;
  mimeType?: string;
  mime_type?: string;
  uri?: string;
  resource?: ToolResultResource;
  [key: string]: unknown;
}

export interface ToolPreviewResponse {
  content?: ToolResultContentBlock[];
  resolved_arguments?: Record<string, unknown>;
  structured_output?: unknown;
  structuredOutput?: unknown;
  isError?: boolean;
  is_error?: boolean;
  target?: "local" | "federated" | ToolPreviewTarget | null;
  annotations?: Record<string, unknown> | null;
  pre_hooks_run?: unknown[] | number | null;
  warnings?: ToolPreviewWarning[];
  [key: string]: unknown;
}

export interface ToolPreviewResult {
  preview: ToolPreviewResponse;
  status: number;
}

/**
 * Validates tool ID to prevent path traversal and injection attacks
 * @param id - The tool ID to validate
 * @returns The validated ID
 * @throws Error if ID is invalid
 */
function validateToolId(id: string): string {
  if (!id || typeof id !== "string") {
    throw new Error("Invalid tool ID");
  }

  // Ensure ID is alphanumeric with hyphens/underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid tool ID format");
  }

  return id;
}

// Mirrors the prompt preview name validator: tools are addressed by their MCP
// name on preview/call surfaces, not by the database ID used by CRUD routes.
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_.\- ]+$/;

function validateToolName(name: string): string {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("Invalid tool name");
  }
  const trimmed = name.trim();
  if (trimmed === "." || trimmed === "..") {
    throw new Error("Invalid tool name format");
  }
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new Error("Invalid tool name format");
  }
  return name;
}

export const toolsApi = {
  /**
   * Fetch a single tool by ID.
   *
   * @param id - The tool ID
   */
  get: (id: string): Promise<Tool> => {
    const validId = validateToolId(id);
    return api.get<Tool>(`/tools/${validId}`);
  },

  /**
   * Delete a tool
   */
  delete: (id: string): Promise<void> => {
    const validId = validateToolId(id);
    return api.delete(`/tools/${validId}`);
  },

  /**
   * Replace a tool's tags.
   *
   * Sends a partial `PUT /tools/{id}` carrying only `tags`; the update service
   * leaves every other field untouched when it is omitted. Returns the updated
   * tool (with backend-normalized tag objects) so callers can patch their cache
   * with the canonical values.
   */
  updateTags: (id: string, tags: string[]): Promise<Tool> => {
    const validId = validateToolId(id);
    return api.put<Tool>(`/tools/${validId}`, { tags });
  },

  // Activation uses the canonical `POST /tools/{tool_id}/state?activate=true|false`
  // endpoint (requires `tools.update` permission). The deprecated `/toggle` endpoint
  // is intentionally not used.

  /**
   * Activate a tool (take it back into routing/availability).
   *
   * @param id - The tool ID
   */
  activate: (id: string): Promise<void> => {
    const validId = validateToolId(id);
    return api.post(`/tools/${validId}/state?activate=true`);
  },

  /**
   * Deactivate a tool (remove it from routing/availability).
   *
   * @param id - The tool ID
   */
  deactivate: (id: string): Promise<void> => {
    const validId = validateToolId(id);
    return api.post(`/tools/${validId}/state?activate=false`);
  },

  /**
   * Dry-run a tool invocation without contacting federated upstream servers.
   *
   * Uses the MCP tool name as the wire identifier, matching snippet output and
   * the future `Mcp-Name` routing header. This intentionally does not use
   * `validateToolId`, because valid tool names may contain spaces and dots.
   */
  preview: (
    name: string,
    args: Record<string, unknown> = {},
    passthroughHeaders: Record<string, string> = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<ToolPreviewResult> => {
    const validName = validateToolName(name);
    return api
      .postWithMeta<ToolPreviewResponse>(
        `/tools/preview/${encodeURIComponent(validName)}`,
        { arguments: args } satisfies ToolPreviewRequest,
        { headers: passthroughHeaders, signal: options.signal },
      )
      .then(({ data, status }) => ({ preview: data, status }));
  },

  /**
   * Generate input/output JSON schemas for a REST tool from its OpenAPI spec.
   *
   * Delegates to `POST /v1/tools/generate-schemas-from-openapi`, which fetches
   * the OpenAPI 3.x document for the tool host, resolves the requested
   * path + method, and returns the extracted schemas plus the `spec_url` it used.
   * Requires the `tools.create` permission. Rejects with an {@link ApiError}
   * carrying the backend status code (400/404/502/500) on failure.
   *
   * @param input - Tool URL, HTTP method, and optional spec URL / auth
   */
  generateSchemasFromOpenapi: (
    input: GenerateSchemasFromOpenapiInput,
  ): Promise<GenerateSchemasFromOpenapiResult> =>
    api.post<GenerateSchemasFromOpenapiResult>("/v1/tools/generate-schemas-from-openapi", input),
};
