import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook as rtlRenderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { IntlProvider } from "react-intl";

import { ApiError } from "@/api/client";
import { importExportApi, type ConfigExport } from "@/api/importExport";
import { useAuth } from "@/auth/useAuth";
import enMessages from "@/i18n/locales/en-US";
import { downloadJson } from "@/lib/download";

import { useExportConfig } from "./useExportConfig";

vi.mock("@/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/download", () => ({ downloadJson: vi.fn() }));
vi.mock("@/api/importExport", () => ({
  importExportApi: { exportConfig: vi.fn(), exportSelective: vi.fn() },
}));

const mockUseAuth = vi.mocked(useAuth);
const mockExportConfig = vi.mocked(importExportApi.exportConfig);
const mockExportSelective = vi.mocked(importExportApi.exportSelective);
const mockDownloadJson = vi.mocked(downloadJson);

const EXPORT: ConfigExport = {
  version: "2025-06-18",
  exported_at: "2026-11-02T10:00:00Z",
  exported_by: "admin@example.com",
  entities: { tools: [] },
};

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    IntlProvider,
    { locale: "en", defaultLocale: "en", messages: enMessages },
    children,
  );

const renderHook = () => rtlRenderHook(() => useExportConfig(), { wrapper });

function grant(...perms: string[]) {
  mockUseAuth.mockReturnValue({
    hasPermission: (perm: string) => perms.includes(perm),
  } as unknown as ReturnType<typeof useAuth>);
}

describe("useExportConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T10:00:00.000Z"));
    grant("admin.export");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("canExport follows the admin.export permission", () => {
    expect(renderHook().result.current.canExport).toBe(true);

    grant();
    expect(renderHook().result.current.canExport).toBe(false);
  });

  it("exportAll fetches with filters and downloads a timestamped file", async () => {
    mockExportConfig.mockResolvedValueOnce(EXPORT);
    const { result } = renderHook();

    let returned!: boolean;
    await act(async () => {
      returned = await result.current.exportAll({ types: ["tools"] });
    });

    expect(returned).toBe(true);

    expect(mockExportConfig).toHaveBeenCalledWith({ types: ["tools"] }, expect.any(AbortSignal));
    expect(mockDownloadJson).toHaveBeenCalledWith(
      EXPORT,
      "contextforge-export-2026-11-02T10-00-00-000Z.json",
    );
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exportSelected passes selection and options through", async () => {
    mockExportSelective.mockResolvedValueOnce(EXPORT);
    const { result } = renderHook();

    await act(() =>
      result.current.exportSelected({ servers: ["s1"] }, { includeDependencies: false }),
    );

    expect(mockExportSelective).toHaveBeenCalledWith(
      { servers: ["s1"] },
      { includeDependencies: false, signal: expect.any(AbortSignal) },
    );
    expect(mockDownloadJson).toHaveBeenCalledOnce();
  });

  it("reports isExporting while the request is in flight", async () => {
    let resolve!: (value: ConfigExport) => void;
    mockExportConfig.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { result } = renderHook();

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.exportAll();
    });
    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      resolve(EXPORT);
      await pending;
    });
    expect(result.current.isExporting).toBe(false);
  });

  it("a second call aborts the first and owns isExporting until it settles", async () => {
    let resolveFirst!: (value: ConfigExport) => void;
    let resolveSecond!: (value: ConfigExport) => void;
    mockExportConfig
      .mockReturnValueOnce(new Promise((r) => (resolveFirst = r)))
      .mockReturnValueOnce(new Promise((r) => (resolveSecond = r)));
    const { result } = renderHook();

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.exportAll();
    });
    act(() => {
      second = result.current.exportAll();
    });
    const firstSignal = mockExportConfig.mock.calls[0][1] as AbortSignal;
    const secondSignal = mockExportConfig.mock.calls[1][1] as AbortSignal;
    expect(firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);

    // The aborted call answering late must not clear the loading state.
    let firstReturned!: boolean;
    await act(async () => {
      resolveFirst(EXPORT);
      firstReturned = await first;
    });
    expect(firstReturned).toBe(false);
    expect(result.current.isExporting).toBe(true);
    expect(mockDownloadJson).not.toHaveBeenCalled();

    let secondReturned!: boolean;
    await act(async () => {
      resolveSecond(EXPORT);
      secondReturned = await second;
    });
    expect(secondReturned).toBe(true);
    expect(result.current.isExporting).toBe(false);
    expect(mockDownloadJson).toHaveBeenCalledOnce();
  });

  it("surfaces the backend detail on failure and skips the download", async () => {
    mockExportConfig.mockRejectedValueOnce(
      new ApiError(403, { detail: "Insufficient permissions" }, "HTTP 403"),
    );
    const { result } = renderHook();

    let returned!: boolean;
    await act(async () => {
      returned = await result.current.exportAll();
    });

    expect(returned).toBe(false);
    expect(result.current.error).toBe("Insufficient permissions");
    expect(mockDownloadJson).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it("falls back to the localized message when the error has no detail", async () => {
    mockExportConfig.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook();

    await act(() => result.current.exportAll());

    expect(result.current.error).toBe("Export failed");
  });

  it("aborts the in-flight request on unmount and never downloads", async () => {
    let resolve!: (value: ConfigExport) => void;
    mockExportConfig.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook();

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.exportAll();
    });
    const signal = mockExportConfig.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);

    resolve(EXPORT);
    expect(await pending).toBe(false);
    expect(mockDownloadJson).not.toHaveBeenCalled();
  });
});
