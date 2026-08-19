/**
 * Resources API service
 */

import { api } from "./client";
import type { ResourceCreate, ResourceRead, ResourceUpdate } from "@/generated/types";

/**
 * Validates resource ID to prevent path traversal and injection attacks
 * @param id - The resource ID to validate
 * @returns The validated ID
 * @throws Error if ID is invalid
 */
function validateResourceId(id: string): string {
  if (!id || typeof id !== "string") {
    throw new Error("Invalid resource ID");
  }

  // Enforce reasonable length limit to prevent DoS
  if (id.length > 255) {
    throw new Error("Resource ID too long");
  }

  // Ensure ID is alphanumeric with hyphens/underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid resource ID format");
  }

  return id;
}

/**
 * Loose shape of the `content` payload returned by {@link resourcesApi.test}.
 *
 * The backend returns `Dict[str, Any]` (see `test_resource_by_uri` in
 * `mcpgateway/main.py`) — depending on the read path this is either a
 * `ResourceContent`/`ResourceContents` model dump (`mimeType`, `text`,
 * `blob`) or, for some template/direct-fetch paths, a raw dict with
 * snake_case keys (`mime_type`). Callers should read through a helper that
 * checks both key spellings (see `ResourcePreviewResult.normalizeMimeType`)
 * rather than indexing a single key directly.
 */
export interface ResourceTestContent {
  uri?: string;
  mimeType?: string | null;
  mime_type?: string | null;
  text?: string | null;
  blob?: string | null;
  size?: number | null;
  [key: string]: unknown;
}

export interface ResourceTestResult {
  content: ResourceTestContent;
  status: number;
}

/**
 * `encodeURI` deliberately leaves `/` and `:` raw (see {@link resourcesApi.test}),
 * but it also leaves `?` and `#` raw — and those two are structural to a URL:
 * unescaped, `?` starts a query string and `#` starts a fragment (fragments
 * never even leave the browser), silently truncating the path the backend
 * receives. Percent-encode just those two so a uri containing them still
 * reaches the `:path` route intact; the backend's path converter decodes
 * `%3F`/`%23` back to the literal chars like any other percent-escape.
 */
function encodeResourceTestUri(uri: string): string {
  return encodeURI(uri).replace(/[?#]/g, (ch) => (ch === "?" ? "%3F" : "%23"));
}

export const resourcesApi = {
  /**
   * Create a new resource
   */
  create: (data: ResourceCreate): Promise<void> => {
    return api.post("/resources", data);
  },

  /**
   * Read a resource's resolved content by URI, without going through the
   * cached `GET /resources/{id}` path. Backs the Resources "Try it" preview.
   *
   * Mirrors `GET /v1/resources/test/{resource_uri:path}` (`mcpgateway/main.py`).
   * The URI is passed through `encodeURI` (not
   * `encodeURIComponent`) so `/` and `:` in the URI survive as path
   * separators rather than being percent-escaped — the backend's `:path`
   * converter expects the raw URI, matching how `resources/read` addresses
   * resources on the MCP wire.
   */
  test: (uri: string, options: { signal?: AbortSignal } = {}): Promise<ResourceTestResult> => {
    if (!uri || typeof uri !== "string") {
      throw new Error("Invalid resource URI");
    }
    return api
      .getWithMeta<{ content: ResourceTestContent }>(
        `/v1/resources/test/${encodeResourceTestUri(uri)}`,
        { signal: options.signal },
      )
      .then(({ data, status }) => ({ content: data.content, status }));
  },

  /**
   * Update a resource
   */
  update: (id: string, data: ResourceUpdate): Promise<void> => {
    const validId = validateResourceId(id);
    return api.put(`/resources/${validId}`, data);
  },

  /**
   * Replace a resource's tags.
   *
   * Sends a partial `PUT /resources/{id}` carrying only `tags`; other fields are
   * preserved because the update service skips omitted values. Returns the
   * updated resource so callers can patch their cache with the normalized tags.
   */
  updateTags: (id: string, tags: string[]): Promise<ResourceRead> => {
    const validId = validateResourceId(id);
    return api.put<ResourceRead>(`/resources/${validId}`, { tags });
  },

  /**
   * Delete a resource
   */
  delete: (id: string): Promise<void> => {
    const validId = validateResourceId(id);
    return api.delete(`/resources/${validId}`);
  },

  /**
   * Set resource state (activate or deactivate).
   *
   * Returns the canonical updated resource so callers can patch their cache
   * directly instead of refetching the whole list.
   *
   * @param id - The resource ID
   * @param activate - True to activate, false to deactivate
   */
  setState: (
    id: string,
    activate: boolean,
  ): Promise<{ status: string; message: string; resource: ResourceRead }> => {
    const validId = validateResourceId(id);
    return api.post(`/resources/${validId}/state?activate=${activate}`);
  },
};
