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
 * Requests + state only. `exportAll`/`exportSelected` resolve true once the
 * file is downloaded and `previewAll` resolves the data; both resolve
 * false/null on failure (`error` set) or abort. Feedback (toasts etc.) is
 * the caller's job.
 */
export interface ExportConfigState {
  /** Full export, optionally filtered; downloads the result as JSON. */
  exportAll: (filters?: ExportFilters) => Promise<boolean>;
  /** Export only the picked entities; downloads the result as JSON. */
  exportSelected: (
    selection: EntitySelection,
    opts?: { includeDependencies?: boolean },
  ) => Promise<boolean>;
  /** Fetches a full export without downloading it, so the caller can confirm first. */
  previewAll: (filters?: ExportFilters) => Promise<ConfigExport | null>;
  /** Downloads already-fetched export data as JSON. */
  download: (data: ConfigExport) => void;
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
    async (
      fetchExport: (signal: AbortSignal) => Promise<ConfigExport>,
    ): Promise<ConfigExport | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setExporting(true);
      setError(null);
      try {
        const data = await fetchExport(controller.signal);
        return controller.signal.aborted ? null : data;
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(parseApiError(err, intl.formatMessage({ id: "importExport.export.failed" })));
        }
        return null;
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

  const download = useCallback((data: ConfigExport) => downloadJson(data, exportFilename()), []);
  const saved = useCallback(
    (data: ConfigExport | null) => {
      if (data) download(data);
      return !!data;
    },
    [download],
  );

  const previewAll = useCallback(
    (filters?: ExportFilters) => run((signal) => importExportApi.exportConfig(filters, signal)),
    [run],
  );
  const exportAll = useCallback(
    async (filters?: ExportFilters) => saved(await previewAll(filters)),
    [previewAll, saved],
  );

  const exportSelected = useCallback(
    (selection: EntitySelection, opts?: { includeDependencies?: boolean }) =>
      run((signal) => importExportApi.exportSelective(selection, { ...opts, signal })).then(saved),
    [run, saved],
  );

  return {
    exportAll,
    exportSelected,
    previewAll,
    download,
    isExporting,
    error,
    canExport: hasPermission("admin.export"),
  };
}
