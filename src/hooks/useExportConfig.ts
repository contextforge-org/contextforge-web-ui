import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import {
  importExportApi,
  type ConfigExport,
  type EntitySelection,
  type ExportFilters,
} from "@/api/importExport";
import { useAuth } from "@/auth/useAuth";
import { downloadJson } from "@/lib/download";
import { parseApiError } from "@/lib/errorUtils";

/**
 * Requests + state only. Actions resolve true once the file is downloaded,
 * false on failure (`error` set) or abort; feedback (toasts etc.) is the
 * caller's job.
 */
export interface ExportConfigState {
  /** Full export, optionally filtered; downloads the result as JSON. */
  exportAll: (filters?: ExportFilters) => Promise<boolean>;
  /** Export only the picked entities; downloads the result as JSON. */
  exportSelected: (
    selection: EntitySelection,
    opts?: { includeDependencies?: boolean },
  ) => Promise<boolean>;
  isExporting: boolean;
  error: string | null;
  canExport: boolean;
}

/** `contextforge-export-2026-11-02T10-00-00-000Z.json` — colons/dots are unsafe in filenames. */
const exportFilename = () =>
  `contextforge-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

export function useExportConfig(): ExportConfigState {
  const intl = useIntl();
  const { hasPermission } = useAuth();
  const [isExporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (fetchExport: (signal: AbortSignal) => Promise<ConfigExport>): Promise<boolean> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setExporting(true);
      setError(null);
      try {
        const data = await fetchExport(controller.signal);
        if (controller.signal.aborted) return false;
        downloadJson(data, exportFilename());
        return true;
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(parseApiError(err, intl.formatMessage({ id: "importExport.export.failed" })));
        }
        return false;
      } finally {
        // A superseding call owns the loading state from here on.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setExporting(false);
        }
      }
    },
    [intl],
  );

  const exportAll = useCallback(
    (filters?: ExportFilters) => run((signal) => importExportApi.exportConfig(filters, signal)),
    [run],
  );

  const exportSelected = useCallback(
    (selection: EntitySelection, opts?: { includeDependencies?: boolean }) =>
      run((signal) => importExportApi.exportSelective(selection, { ...opts, signal })),
    [run],
  );

  return {
    exportAll,
    exportSelected,
    isExporting,
    error,
    canExport: hasPermission("admin.export"),
  };
}
