import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook as rtlRenderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { IntlProvider } from "react-intl";

import { ApiError } from "@/api/client";
import { importExportApi, type ConfigExport, type ImportResult } from "@/api/importExport";
import { useAuth } from "@/auth/useAuth";
import enMessages from "@/i18n/locales/en-US";

import { importOutcome, useImportConfig } from "./useImportConfig";

vi.mock("@/auth/useAuth", () => ({ useAuth: vi.fn() }));
// Keep parseImportFile/ImportFileError real; stub only the network calls.
vi.mock("@/api/importExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/importExport")>();
  return { ...actual, importExportApi: { importConfig: vi.fn() } };
});

const mockUseAuth = vi.mocked(useAuth);
const mockImportConfig = vi.mocked(importExportApi.importConfig);

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
    grant("admin.import");
  });

  it("canImport follows the admin.import permission", () => {
    expect(renderHook().result.current.canImport).toBe(true);

    grant();
    expect(renderHook().result.current.canImport).toBe(false);
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

    describe("superseded reads", () => {
      // A file whose read settles only when the test says so.
      function slowFile() {
        let resolve!: (content: string) => void;
        let reject!: (err: Error) => void;
        const text = new Promise<string>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { file: { text: () => text } as unknown as File, resolve, reject };
      }
      const OTHER: ConfigExport = { ...EXPORT, entities: { servers: [{ name: "s1" }] } };

      it("keeps the newer file when an older read finishes last", async () => {
        const a = slowFile();
        const b = slowFile();
        const { result } = renderHook();

        let loadA!: Promise<boolean>;
        let loadB!: Promise<boolean>;
        act(() => {
          loadA = result.current.loadFile(a.file);
        });
        act(() => {
          loadB = result.current.loadFile(b.file);
        });

        let okB!: boolean;
        await act(async () => {
          b.resolve(JSON.stringify(OTHER));
          okB = await loadB;
        });
        let okA!: boolean;
        await act(async () => {
          a.resolve(JSON.stringify(EXPORT));
          okA = await loadA;
        });

        expect(okB).toBe(true);
        expect(okA).toBe(false);
        expect(result.current.data).toEqual(OTHER);
      });

      it("does not restore a file discarded by reset mid-read", async () => {
        const a = slowFile();
        const { result } = renderHook();

        let load!: Promise<boolean>;
        act(() => {
          load = result.current.loadFile(a.file);
        });
        act(() => result.current.reset());

        let ok!: boolean;
        await act(async () => {
          a.resolve(JSON.stringify(EXPORT));
          ok = await load;
        });

        expect(ok).toBe(false);
        expect(result.current.data).toBeNull();
      });

      it("ignores a late failure from a superseded read", async () => {
        const a = slowFile();
        const { result } = renderHook();

        let loadA!: Promise<boolean>;
        act(() => {
          loadA = result.current.loadFile(a.file);
        });
        await act(() => result.current.loadFile(exportFile()));
        await act(async () => {
          a.reject(new Error("NotReadableError"));
          await loadA;
        });

        expect(result.current.data).toEqual(EXPORT);
        expect(result.current.error).toBeNull();
      });

      it("ignores a late failure after reset", async () => {
        const a = slowFile();
        const { result } = renderHook();

        let load!: Promise<boolean>;
        act(() => {
          load = result.current.loadFile(a.file);
        });
        act(() => result.current.reset());
        await act(async () => {
          a.resolve("{not json");
          await load;
        });

        expect(result.current.error).toBeNull();
      });
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

    await act(async () => {
      expect(await result.current.dryRun()).toBeNull();
      expect(await result.current.runImport()).toBeNull();
    });

    expect(mockImportConfig).not.toHaveBeenCalled();
  });

  it("dryRun sends dryRun: true and stores the result separately", async () => {
    mockImportConfig.mockResolvedValueOnce(RESULT);
    const { result } = await loaded();

    let returned!: ImportResult | null;
    await act(async () => {
      returned = await result.current.dryRun({ conflictStrategy: "skip" });
    });

    expect(mockImportConfig).toHaveBeenCalledWith(
      { conflictStrategy: "skip", data: EXPORT, dryRun: true },
      expect.any(AbortSignal),
    );
    expect(returned).toEqual(RESULT);
    expect(result.current.dryRunResult).toEqual(RESULT);
    expect(result.current.result).toBeNull();
  });

  it("runImport sends dryRun: false and resolves with the result", async () => {
    mockImportConfig.mockResolvedValueOnce(RESULT);
    const { result } = await loaded();

    let returned!: ImportResult | null;
    await act(async () => {
      returned = await result.current.runImport({ selectedEntities: { tools: ["t1"] } });
    });

    expect(mockImportConfig).toHaveBeenCalledWith(
      { selectedEntities: { tools: ["t1"] }, data: EXPORT, dryRun: false },
      expect.any(AbortSignal),
    );
    expect(returned).toEqual(RESULT);
    expect(result.current.result).toEqual(RESULT);
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

    let returned: ImportResult | null | undefined;
    await act(async () => {
      returned = await result.current.runImport();
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe(message);
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

  it("falls back to the localized message when the error has no detail", async () => {
    mockImportConfig.mockRejectedValueOnce(new Error("network"));
    const { result } = await loaded();

    await act(() => result.current.runImport());

    expect(result.current.error).toBe("Import failed");
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

  it("resolves null and keeps state clear when a reset request answers late", async () => {
    let resolve!: (value: ImportResult) => void;
    mockImportConfig.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { result } = await loaded();

    let pending!: Promise<ImportResult | null>;
    act(() => {
      pending = result.current.runImport();
    });
    act(() => result.current.reset());

    let returned: ImportResult | null | undefined;
    await act(async () => {
      resolve(RESULT);
      returned = await pending;
    });

    expect(returned).toBeNull();
    expect(result.current.result).toBeNull();
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

describe("importOutcome", () => {
  const withProgress = (
    failed: number,
    total: number,
    status: ImportResult["status"] = "completed",
  ) => ({ ...RESULT, status, progress: { ...RESULT.progress, failed, total } }) as ImportResult;

  it.each([
    ["no failures", withProgress(0, 4), "success"],
    ["an empty import", withProgress(0, 0), "success"],
    ["some failures", withProgress(1, 4), "partial"],
    ["every entity failed", withProgress(4, 4), "failed"],
    ["a failed status", withProgress(0, 4, "failed"), "failed"],
  ])("classifies %s", (_label, result, outcome) => {
    expect(importOutcome(result)).toBe(outcome);
  });
});
