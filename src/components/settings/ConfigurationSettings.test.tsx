import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { toast } from "sonner";

import { importExportApi, type ImportResult } from "@/api/importExport";
import enMessages from "@/i18n/locales/en-US";

import { ConfigurationSettings } from "./ConfigurationSettings";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/auth/useAuth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
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
const FILE = { text: async () => JSON.stringify(EXPORT) } as unknown as File;

function pickVia(buttonName: string) {
  const { getByRole, getByTestId } = render(
    <IntlProvider locale="en" messages={enMessages}>
      <ConfigurationSettings />
    </IntlProvider>,
  );
  fireEvent.click(getByRole("button", { name: buttonName }));
  fireEvent.change(getByTestId("import-config-input"), { target: { files: [FILE] } });
}

describe("ConfigurationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importExportApi.importConfig).mockResolvedValue(RESULT);
  });

  it("imports the picked file and toasts the outcome", async () => {
    pickVia("Import configuration");

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.success).mock.calls[0][0]).toBe(
      "Imported 1 MCP server and 2 virtual servers: 1 created, 1 updated, 0 skipped.",
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
});
