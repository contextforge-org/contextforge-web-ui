import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { toast } from "sonner";

import { importExportApi, type ImportResult } from "@/api/importExport";
import enMessages from "@/i18n/locales/en-US";

import { ConfigurationSettings } from "./ConfigurationSettings";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
let canImport = true;
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ hasPermission: () => canImport }) }));
vi.mock("@/api/importExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/importExport")>();
  return { ...actual, importExportApi: { importConfig: vi.fn() } };
});

const RESULT: ImportResult = {
  import_id: "imp-1",
  status: "completed",
  progress: { total: 2, processed: 2, created: 1, updated: 1, skipped: 0, failed: 0 },
  errors: [],
  warnings: [],
  started_at: "2026-11-02T10:00:00Z",
  completed_at: "2026-11-02T10:00:01Z",
};

const EXPORT = {
  version: "1",
  exported_at: "2026-11-02T10:00:00Z",
  entities: { gateways: [{ name: "g1" }], servers: [{ name: "s1" }, { name: "s2" }] },
};

// jsdom's File has no .text(); parseImportFile only needs that.
const fileOf = (content: string) => ({ text: async () => content }) as unknown as File;
const FILE = fileOf(JSON.stringify(EXPORT));

const renderSettings = () =>
  render(
    <IntlProvider locale="en" messages={enMessages}>
      <ConfigurationSettings />
    </IntlProvider>,
  );

function pickVia(buttonName: string, file = FILE) {
  const { getByRole, getByTestId } = renderSettings();
  fireEvent.click(getByRole("button", { name: buttonName }));
  fireEvent.change(getByTestId("import-config-input"), { target: { files: [file] } });
}

const withProgress = (progress: Partial<ImportResult["progress"]>): ImportResult => ({
  ...RESULT,
  progress: { ...RESULT.progress, ...progress },
});

describe("ConfigurationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canImport = true;
    vi.mocked(importExportApi.importConfig).mockResolvedValue(RESULT);
  });

  it("imports the picked file and toasts the outcome", async () => {
    pickVia("Import configuration");

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe(
      "Import complete: 1 created, 1 updated, 0 skipped. File contained 1 MCP server and 2 virtual servers.",
    );
    expect(importExportApi.importConfig).toHaveBeenCalledTimes(1);
    expect(vi.mocked(importExportApi.importConfig).mock.calls[0][0]).toMatchObject({
      data: EXPORT,
      dryRun: false,
    });
  });

  it("dry run summarises the file by type and says nothing changed", async () => {
    pickVia("Dry run");

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(vi.mocked(importExportApi.importConfig).mock.calls[0][0]).toMatchObject({
      dryRun: true,
    });
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe(
      "Dry run: would import 1 MCP server and 2 virtual servers. Nothing was changed.",
    );
  });

  it("warns on a partial import", async () => {
    vi.mocked(importExportApi.importConfig).mockResolvedValue(
      withProgress({ created: 1, updated: 0, failed: 1 }),
    );
    pickVia("Import configuration");

    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toBe(
      "Import partially applied: 1 created, 0 updated, 0 skipped, 1 failed. File contained 1 MCP server and 2 virtual servers.",
    );
  });

  it("errors when every item fails", async () => {
    vi.mocked(importExportApi.importConfig).mockResolvedValue(
      withProgress({ created: 0, updated: 0, failed: 2 }),
    );
    pickVia("Import configuration");

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(
      "Import failed: no items could be applied.",
    );
  });

  it("does not claim success when a dry run fails", async () => {
    vi.mocked(importExportApi.importConfig).mockResolvedValue({ ...RESULT, status: "failed" });
    pickVia("Dry run");

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe(
      "Dry run found problems importing 1 MCP server and 2 virtual servers. Nothing was changed.",
    );
  });

  it("toasts an invalid file without calling the API", async () => {
    pickVia("Import configuration", fileOf("{not json"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe("The selected file is not valid JSON");
    expect(importExportApi.importConfig).not.toHaveBeenCalled();
  });

  it("short-circuits an empty export without calling the API", async () => {
    pickVia("Import configuration", fileOf(JSON.stringify({ ...EXPORT, entities: {} })));

    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.info).mock.calls[0][0]).toBe("The file contains nothing to import.");
    expect(importExportApi.importConfig).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("disables both buttons without the import permission", () => {
    canImport = false;
    const { getByRole } = renderSettings();

    expect(getByRole("button", { name: "Import configuration" })).toBeDisabled();
    expect(getByRole("button", { name: "Dry run" })).toBeDisabled();
  });
});
