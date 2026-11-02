/**
 * Configuration import/export service.
 *
 * Wraps `/v1/export`, `/v1/export/selective`, `/v1/import` and the admin
 * import preview. Export needs `admin.export`; import needs `admin.import`;
 * preview needs `admin.system_config`. The backend enforces all three.
 *
 * Import bodies go through dedicated BFF routes with a larger body limit
 * (see server/src/routes/proxy/catch-all.ts).
 */

import { api } from "./client";
import type {
  BodyImportConfigurationV1ImportPost,
  ExportConfigurationV1ExportGetParams,
} from "@/generated/types";

export type ExportEntityType = "tools" | "gateways" | "servers" | "prompts" | "resources" | "roots";

/** Entity type -> IDs/names, used by selective export and selective import. */
export type EntitySelection = Partial<Record<ExportEntityType, string[]>>;

/**
 * Export envelope. The backend returns an untyped dict, so orval generates
 * `{ [key: string]: unknown }`; this narrows it by hand.
 */
export interface ConfigExport {
  version: string;
  exported_at: string;
  exported_by: string;
  entities: Partial<Record<ExportEntityType, Record<string, unknown>[]>>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ExportFilters {
  types?: ExportEntityType[];
  excludeTypes?: ExportEntityType[];
  tags?: string[];
  includeInactive?: boolean;
  includeDependencies?: boolean;
}

export type ImportConflictStrategy = "skip" | "update" | "rename" | "fail";

export interface ImportOptions {
  data: ConfigExport;
  conflictStrategy?: ImportConflictStrategy;
  dryRun?: boolean;
  /** New encryption secret for cross-environment imports. */
  rekeySecret?: string;
  selectedEntities?: EntitySelection;
}

/** `ImportStatus.to_dict()` on the backend. Import is synchronous, so this is final. */
export interface ImportResult {
  import_id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: {
    total: number;
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  errors: string[];
  warnings: string[];
  started_at: string;
  completed_at: string | null;
}

export interface ImportPreviewItem {
  id: string;
  name: string;
  type: ExportEntityType;
  description: string;
  is_gateway_item: boolean;
  is_custom: boolean;
  conflicts_with?: boolean;
  [key: string]: unknown;
}

export interface ImportPreview {
  summary: { total_items: number; by_type: Partial<Record<ExportEntityType, number>> };
  items: Partial<Record<ExportEntityType, ImportPreviewItem[]>>;
  bundles: Record<string, unknown>;
  dependencies: Record<string, unknown>;
  conflicts: Record<string, unknown>;
}

interface ImportPreviewResponse {
  success: boolean;
  preview: ImportPreview;
  message: string;
}

export class ImportFileError extends Error {
  constructor(
    public readonly code: "invalid_json" | "invalid_shape",
    message: string,
  ) {
    super(message);
    this.name = "ImportFileError";
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads and shape-checks an export file before anything is sent upstream. */
export async function parseImportFile(file: File): Promise<ConfigExport> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportFileError("invalid_json", "File is not valid JSON");
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.entities)) {
    throw new ImportFileError("invalid_shape", "File is not a ContextForge export");
  }
  return parsed as ConfigExport;
}

function exportQuery(filters: ExportFilters): string {
  const params: ExportConfigurationV1ExportGetParams = {
    types: filters.types?.join(","),
    exclude_types: filters.excludeTypes?.join(","),
    tags: filters.tags?.join(","),
    include_inactive: filters.includeInactive,
    include_dependencies: filters.includeDependencies,
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

export const importExportApi = {
  /** Full export, optionally filtered by type/tags. */
  exportConfig: (filters: ExportFilters = {}, signal?: AbortSignal): Promise<ConfigExport> => {
    const query = exportQuery(filters);
    return api.get<ConfigExport>(`/v1/export${query ? `?${query}` : ""}`, undefined, signal);
  },

  /** Export only the picked entities (by ID or name). */
  exportSelective: (
    selection: EntitySelection,
    opts: { includeDependencies?: boolean; signal?: AbortSignal } = {},
  ): Promise<ConfigExport> => {
    const query =
      opts.includeDependencies === undefined
        ? ""
        : `?include_dependencies=${opts.includeDependencies}`;
    return api.post<ConfigExport>(`/v1/export/selective${query}`, selection, {
      signal: opts.signal,
    });
  },

  /** Import (or validate, with `dryRun`) an export file's content. */
  importConfig: (opts: ImportOptions, signal?: AbortSignal): Promise<ImportResult> => {
    const body: BodyImportConfigurationV1ImportPost = {
      import_data: opts.data,
      conflict_strategy: opts.conflictStrategy ?? "update",
      dry_run: opts.dryRun ?? false,
      rekey_secret: opts.rekeySecret, // pragma: allowlist secret
      selected_entities: opts.selectedEntities,
    };
    return api.post<ImportResult>("/v1/import", body, { signal });
  },

  /** Per-item preview with conflicts; needs `admin.system_config`. */
  previewImport: async (data: ConfigExport, signal?: AbortSignal): Promise<ImportPreview> => {
    const response = await api.post<ImportPreviewResponse>(
      "/v1/admin/import/preview",
      { data },
      { signal },
    );
    return response.preview;
  },
};
