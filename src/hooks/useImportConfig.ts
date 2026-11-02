import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import {
  ImportFileError,
  importExportApi,
  parseImportFile,
  type ConfigExport,
  type ImportOptions,
  type ImportPreview,
  type ImportResult,
} from "@/api/importExport";
import { useAuth } from "@/auth/useAuth";
import { parseApiError } from "@/lib/errorUtils";

/** Everything but the file content, which the hook holds itself. */
export type ImportRunOptions = Omit<ImportOptions, "data" | "dryRun">;

export interface ImportConfigState {
  /** Reads + shape-checks a file; resolves false (with `error` set) when it's unusable. */
  loadFile: (file: File) => Promise<boolean>;
  /** Per-item preview with conflicts; no-op without a file or `canPreview`. */
  preview: () => Promise<void>;
  /** Validates the import server-side without writing anything. */
  dryRun: (opts?: ImportRunOptions) => Promise<void>;
  runImport: (opts?: ImportRunOptions) => Promise<void>;
  reset: () => void;
  data: ConfigExport | null;
  previewResult: ImportPreview | null;
  dryRunResult: ImportResult | null;
  result: ImportResult | null;
  isLoading: boolean;
  error: string | null;
  canImport: boolean;
  canPreview: boolean;
}

// Backend details for these are generic English; prefer our own copy.
const STATUS_MESSAGE_IDS: Record<number, string> = {
  403: "importExport.import.forbidden",
  409: "importExport.import.conflict",
  413: "importExport.import.tooLarge",
  422: "importExport.import.validationFailed",
};

function importErrorMessage(err: unknown, intl: IntlShape, fallbackId: string): string {
  const id = err instanceof ApiError ? STATUS_MESSAGE_IDS[err.status] : undefined;
  return id
    ? intl.formatMessage({ id })
    : parseApiError(err, intl.formatMessage({ id: fallbackId }));
}

export function useImportConfig(): ImportConfigState {
  const intl = useIntl();
  const { hasPermission } = useAuth();
  const canImport = hasPermission("admin.import");
  const canPreview = hasPermission("admin.system_config");
  const [data, setData] = useState<ConfigExport | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportPreview | null>(null);
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abortCurrent = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async <T>(
      request: (signal: AbortSignal) => Promise<T>,
      onSuccess: (value: T) => void,
      fallbackId: string,
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const value = await request(controller.signal);
        if (!controller.signal.aborted) onSuccess(value);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = importErrorMessage(err, intl, fallbackId);
        setError(message);
        toast.error(message);
      } finally {
        // A superseding call owns the loading state from here on.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [intl],
  );

  const reset = useCallback(() => {
    abortCurrent();
    setData(null);
    setPreviewResult(null);
    setDryRunResult(null);
    setResult(null);
    setError(null);
  }, [abortCurrent]);

  const loadFile = useCallback(
    async (file: File) => {
      reset();
      try {
        setData(await parseImportFile(file));
        return true;
      } catch (err) {
        // Anything else is the browser failing to read the file.
        const id = !(err instanceof ImportFileError)
          ? "importExport.import.failed"
          : err.code === "invalid_json"
            ? "importExport.import.invalidJson"
            : "importExport.import.invalidShape";
        setError(intl.formatMessage({ id }));
        return false;
      }
    },
    [intl, reset],
  );

  const preview = useCallback(async () => {
    if (!data || !canPreview) return;
    await run(
      (signal) => importExportApi.previewImport(data, signal),
      setPreviewResult,
      "importExport.preview.failed",
    );
  }, [canPreview, data, run]);

  const dryRun = useCallback(
    async (opts: ImportRunOptions = {}) => {
      if (!data) return;
      await run(
        (signal) => importExportApi.importConfig({ ...opts, data, dryRun: true }, signal),
        setDryRunResult,
        "importExport.import.failed",
      );
    },
    [data, run],
  );

  const runImport = useCallback(
    async (opts: ImportRunOptions = {}) => {
      if (!data) return;
      await run(
        (signal) => importExportApi.importConfig({ ...opts, data, dryRun: false }, signal),
        (value) => {
          setResult(value);
          toast.success(intl.formatMessage({ id: "importExport.import.success" }, value.progress));
        },
        "importExport.import.failed",
      );
    },
    [data, intl, run],
  );

  return {
    loadFile,
    preview,
    dryRun,
    runImport,
    reset,
    data,
    previewResult,
    dryRunResult,
    result,
    isLoading,
    error,
    canImport,
    canPreview,
  };
}
