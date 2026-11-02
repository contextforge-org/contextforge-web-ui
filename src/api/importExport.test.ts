import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ImportFileError,
  importExportApi,
  parseImportFile,
  type ConfigExport,
} from "./importExport";
import { setCsrfToken } from "./client";

const EXPORT: ConfigExport = {
  version: "2025-06-18",
  exported_at: "2026-11-02T10:00:00Z",
  exported_by: "admin@example.com",
  entities: { tools: [{ name: "t1" }] },
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("importExportApi", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    vi.clearAllMocks();
    setCsrfToken("test-csrf-token");
  });

  afterEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
  });

  const lastUrl = () => new URL(mockFetch.mock.calls[0][0] as string);
  const lastInit = () => mockFetch.mock.calls[0][1] as RequestInit;
  const lastBody = () => JSON.parse(lastInit().body as string);

  describe("exportConfig", () => {
    it("GETs /api/v1/export with no query when no filters are given", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(EXPORT));

      const result = await importExportApi.exportConfig();

      expect(lastUrl().pathname).toBe("/api/v1/export");
      expect(lastUrl().search).toBe("");
      expect(lastInit().method).toBe("GET");
      expect(result).toEqual(EXPORT);
    });

    it("joins list filters as CSV and serializes booleans", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(EXPORT));

      await importExportApi.exportConfig({
        types: ["tools", "servers"],
        excludeTypes: ["roots"],
        tags: ["prod", "team-a"],
        includeInactive: true,
        includeDependencies: false,
      });

      const params = lastUrl().searchParams;
      expect(params.get("types")).toBe("tools,servers");
      expect(params.get("exclude_types")).toBe("roots");
      expect(params.get("tags")).toBe("prod,team-a");
      expect(params.get("include_inactive")).toBe("true");
      expect(params.get("include_dependencies")).toBe("false");
    });

    it("omits empty list filters", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(EXPORT));

      await importExportApi.exportConfig({ types: [], tags: [] });

      expect(lastUrl().search).toBe("");
    });
  });

  describe("exportSelective", () => {
    it("POSTs the selection as the body with the CSRF header", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(EXPORT));

      await importExportApi.exportSelective({ tools: ["a", "b"], servers: ["s1"] });

      expect(lastUrl().pathname).toBe("/api/v1/export/selective");
      expect(lastUrl().search).toBe("");
      expect(lastInit().method).toBe("POST");
      expect(lastInit().headers).toMatchObject({ "X-CSRF-Token": "test-csrf-token" });
      expect(lastBody()).toEqual({ tools: ["a", "b"], servers: ["s1"] });
    });

    it("passes include_dependencies as a query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(EXPORT));

      await importExportApi.exportSelective({ tools: ["a"] }, { includeDependencies: false });

      expect(lastUrl().searchParams.get("include_dependencies")).toBe("false");
    });
  });

  describe("importConfig", () => {
    it("maps options to the backend body with defaults", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ import_id: "imp-1", status: "completed" }));

      const result = await importExportApi.importConfig({ data: EXPORT });

      expect(lastUrl().pathname).toBe("/api/v1/import");
      expect(lastInit().method).toBe("POST");
      expect(lastBody()).toEqual({
        import_data: EXPORT,
        conflict_strategy: "update",
        dry_run: false,
      });
      expect(result).toMatchObject({ import_id: "imp-1" });
    });

    it("sends dry run, strategy, rekey secret and selection", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ import_id: "imp-2" }));

      await importExportApi.importConfig({
        data: EXPORT,
        conflictStrategy: "skip",
        dryRun: true,
        rekeySecret: "new-secret", // pragma: allowlist secret
        selectedEntities: { tools: ["t1"] },
      });

      expect(lastBody()).toEqual({
        import_data: EXPORT,
        conflict_strategy: "skip",
        dry_run: true,
        rekey_secret: "new-secret", // pragma: allowlist secret
        selected_entities: { tools: ["t1"] },
      });
    });
  });

  describe("previewImport", () => {
    it("wraps the data in { data } and unwraps .preview", async () => {
      const preview = {
        summary: { total_items: 1, by_type: { tools: 1 } },
        items: { tools: [{ id: "t1", name: "t1", type: "tools" }] },
        bundles: {},
        dependencies: {},
        conflicts: {},
      };
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, preview, message: "ok" }));

      const result = await importExportApi.previewImport(EXPORT);

      expect(lastUrl().pathname).toBe("/api/v1/admin/import/preview");
      expect(lastBody()).toEqual({ data: EXPORT });
      expect(result).toEqual(preview);
    });
  });
});

describe("parseImportFile", () => {
  // jsdom's File has no .text(); parseImportFile only needs that.
  const fileOf = (content: string) => ({ text: async () => content }) as unknown as File;

  it("returns the parsed export", async () => {
    await expect(parseImportFile(fileOf(JSON.stringify(EXPORT)))).resolves.toEqual(EXPORT);
  });

  it("rejects non-JSON with invalid_json", async () => {
    await expect(parseImportFile(fileOf("{not json"))).rejects.toMatchObject({
      name: "ImportFileError",
      code: "invalid_json",
    });
  });

  it.each([
    ["an array", "[]"],
    ["a primitive", "42"],
    ["missing entities", JSON.stringify({ version: "x" })],
    ["array entities", JSON.stringify({ entities: [] })],
  ])("rejects %s with invalid_shape", async (_label, content) => {
    const error = await parseImportFile(fileOf(content)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportFileError);
    expect((error as ImportFileError).code).toBe("invalid_shape");
  });
});
