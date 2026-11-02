import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook as rtlRenderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import {
  importExportApi,
  type ConfigExport,
  type ImportPreview,
  type ImportResult,
} from "@/api/importExport";
import { useAuth } from "@/auth/useAuth";
import enMessages from "@/i18n/locales/en-US";

import { useImportConfig } from "./useImportConfig";

vi.mock("@/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Keep parseImportFile/ImportFileError real; stub only the network calls.
vi.mock("@/api/importExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/importExport")>();
  return { ...actual, importExportApi: { importConfig: vi.fn(), previewImport: vi.fn() } };
});

const mockUseAuth = vi.mocked(useAuth);
const mockImportConfig = vi.mocked(importExportApi.importConfig);
const mockPreviewImport = vi.mocked(importExportApi.previewImport);

const EXPORT: ConfigExport = {
  version: "2025-06-18",
  exported_at: "2026-11-02T10:00:00Z",
  exported_by: "admin@example.com",
  entities: { tools: [{ name: "t1" }] },
};

const RESULT: ImportResult = {
  import_id: "imp-1",
  status: "completed",
  progress: { total: 4, processed: 4, created: 1, updated: 2, skipped: 1, failed: 0 },
  errors: [],
  warnings: [],
  started_at: "2026-11-02T10:00:00Z",
  completed_at: "2026-11-02T10:00:01Z",
};

const PREVIEW: ImportPreview = {
  summary: { total_items: 1, by_type: { tools: 1 } },
  items: {},
  bundles: {},
  dependencies: {},
  conflicts: {},
};

// jsdom's File has no .text(); parseImportFile only needs that.
const fileOf = (content: string) => ({ text: async () => content }) as unknown as File;
const exportFile = () => fileOf(JSON.stringify(EXPORT));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    IntlProvider,
    { locale: "en", defaultLocale: "en", messages: enMessages },
    children,
  );

const renderHook = () => rtlRenderHook(() => useImportConfig(), { wrapper });

function grant(...perms: string[]) {
  mockUseAuth.mockReturnValue({
    hasPermission: (perm: string) => perms.includes(perm),
  } as unknown as ReturnType<typeof useAuth>);
}

async function loaded() {
  const hook = renderHook();
  await act(() => hook.result.current.loadFile(exportFile()));
  return hook;
}

describe("useImportConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grant("admin.import", "admin.system_config");
  });

  it("derives canImport and canPreview from separate permissions", () => {
    expect(renderHook().result.current).toMatchObject({ canImport: true, canPreview: true });

    grant("admin.import");
    expect(renderHook().result.current).toMatchObject({ canImport: true, canPreview: false });
  });

  describe("loadFile", () => {
    it("holds the parsed export", async () => {
      const { result } = renderHook();

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.loadFile(exportFile());
      });

      expect(ok).toBe(true);
      expect(result.current.data).toEqual(EXPORT);
      expect(result.current.error).toBeNull();
    });

    it.each([
      ["{not json", "The selected file is not valid JSON"],
      [JSON.stringify({ version: "x" }), "The selected file is not a ContextForge export"],
    ])("rejects %s with a localized error and no request", async (content, message) => {
      const { result } = renderHook();

      let ok!: boolean;
      await act(async () => {
        ok = await result.current.loadFile(fileOf(content));
      });

      expect(ok).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe(message);
      expect(mockImportConfig).not.toHaveBeenCalled();
    });

    it("maps an unreadable file to the generic failure", async () => {
      const unreadable = { text: () => Promise.reject(new Error("NotReadableError")) };
      const { result } = renderHook();

      await act(() => result.current.loadFile(unreadable as unknown as File));

      expect(result.current.error).toBe("Import failed");
    });

    it("clears earlier results when a new file is loaded", async () => {
      mockImportConfig.mockResolvedValueOnce(RESULT);
      const { result } = await loaded();
      await act(() => result.current.runImport());
      expect(result.current.result).not.toBeNull();

      await act(() => result.current.loadFile(exportFile()));

      expect(result.current.result).toBeNull();
    });
  });

  it("does nothing before a file is loaded", async () => {
    const { result } = renderHook();

    await act(() => result.current.dryRun());
    await act(() => result.current.runImport());
    await act(() => result.current.preview());

    expect(mockImportConfig).not.toHaveBeenCalled();
    expect(mockPreviewImport).not.toHaveBeenCalled();
  });

  it("dryRun sends dryRun: true and stores the result separately", async () => {
    mockImportConfig.mockResolvedValueOnce(RESULT);
    const { result } = await loaded();

    await act(() => result.current.dryRun({ conflictStrategy: "skip" }));

    expect(mockImportConfig).toHaveBeenCalledWith(
      { conflictStrategy: "skip", data: EXPORT, dryRun: true },
      expect.any(AbortSignal),
    );
    expect(result.current.dryRunResult).toEqual(RESULT);
    expect(result.current.result).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("runImport sends dryRun: false and toasts the counts", async () => {
    mockImportConfig.mockResolvedValueOnce(RESULT);
    const { result } = await loaded();

    await act(() => result.current.runImport({ selectedEntities: { tools: ["t1"] } }));

    expect(mockImportConfig).toHaveBeenCalledWith(
      { selectedEntities: { tools: ["t1"] }, data: EXPORT, dryRun: false },
      expect.any(AbortSignal),
    );
    expect(result.current.result).toEqual(RESULT);
    expect(toast.success).toHaveBeenCalledWith(
      "Import complete: 1 created, 2 updated, 1 skipped, 0 failed",
    );
  });

  it.each([
    [403, "You don't have permission to import this configuration"],
    [409, "Import stopped: some items already exist"],
    [413, "The file is too large to import"],
    [422, "The file failed import validation"],
  ])("maps HTTP %i to its localized message", async (status, message) => {
    mockImportConfig.mockRejectedValueOnce(
      new ApiError(status, { detail: "generic backend text" }, `HTTP ${status}`),
    );
    const { result } = await loaded();

    await act(() => result.current.runImport());

    expect(result.current.error).toBe(message);
    expect(toast.error).toHaveBeenCalledWith(message);
    expect(result.current.isLoading).toBe(false);
  });

  it("uses the backend detail for other errors", async () => {
    mockImportConfig.mockRejectedValueOnce(
      new ApiError(400, { detail: "Invalid conflict strategy" }, "HTTP 400"),
    );
    const { result } = await loaded();

    await act(() => result.current.runImport());

    expect(result.current.error).toBe("Invalid conflict strategy");
  });

  describe("preview", () => {
    it("stores the preview when allowed", async () => {
      mockPreviewImport.mockResolvedValueOnce(PREVIEW);
      const { result } = await loaded();

      await act(() => result.current.preview());

      expect(mockPreviewImport).toHaveBeenCalledWith(EXPORT, expect.any(AbortSignal));
      expect(result.current.previewResult).toEqual(PREVIEW);
    });

    it("is skipped without admin.system_config", async () => {
      grant("admin.import");
      const { result } = await loaded();

      await act(() => result.current.preview());

      expect(mockPreviewImport).not.toHaveBeenCalled();
    });

    it("falls back to the preview message", async () => {
      mockPreviewImport.mockRejectedValueOnce(new Error("network"));
      const { result } = await loaded();

      await act(() => result.current.preview());

      expect(result.current.error).toBe("Could not preview the import");
    });
  });

  it("reset aborts the request and clears all state", async () => {
    mockImportConfig.mockReturnValueOnce(new Promise(() => {}));
    const { result } = await loaded();

    act(() => {
      void result.current.runImport();
    });
    expect(result.current.isLoading).toBe(true);
    const signal = mockImportConfig.mock.calls[0][1] as AbortSignal;

    act(() => result.current.reset());

    expect(signal.aborted).toBe(true);
    expect(result.current).toMatchObject({ data: null, isLoading: false, error: null });
  });

  it("aborts the in-flight request on unmount", async () => {
    mockImportConfig.mockReturnValueOnce(new Promise(() => {}));
    const { result, unmount } = await loaded();

    act(() => {
      void result.current.runImport();
    });
    const signal = mockImportConfig.mock.calls[0][1] as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
  });
});
