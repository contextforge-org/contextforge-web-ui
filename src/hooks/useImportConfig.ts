import { useCallback, useEffect, useRef, useState } from "react";
import { useIntl, type IntlShape } from "react-intl";

import { ApiError } from "@/api/client";
import {
  ImportFileError,
  importExportApi,
  parseImportFile,
  type ConfigExport,
  type ImportOptions,
  type ImportResult,
} from "@/api/importExport";
import { useAuth } from "@/auth/useAuth";
import { parseApiError } from "@/lib/errorUtils";

/** Everything but the file content, which the hook holds itself. */
export type ImportRunOptions = Omit<ImportOptions, "data" | "dryRun">;

/**
 * Requests + state only. Actions resolve with their result, or null on failure
 * (`error` set), abort, or a skipped call; feedback (toasts etc.) is the
 * caller's job. Use `importOutcome` to judge an import result.
 */
export interface ImportConfigState {
  /** Reads + shape-checks a file; null when unusable (`error` set) or superseded by a newer load/reset. */
  loadFile: (file: File) => Promise<ConfigExport | null>;
  /** Validates the import server-side without writing anything. */
  dryRun: (opts?: ImportRunOptions) => Promise<ImportResult | null>;
  runImport: (opts?: ImportRunOptions) => Promise<ImportResult | null>;
  reset: () => void;
  data: ConfigExport | null;
  dryRunResult: ImportResult | null;
  result: ImportResult | null;
  isLoading: boolean;
  error: string | null;
  canImport: boolean;
}

export type ImportOutcome = "success" | "partial" | "failed";

/**
 * The backend reports `completed` even when entities fail, so judge by counts.
 * Works for dry-run results too.
 */
export function importOutcome(result: ImportResult): ImportOutcome {
  const { failed, total } = result.progress;
  if (result.status === "failed" || (total > 0 && failed >= total)) return "failed";
  return failed > 0 ? "partial" : "success";
}

// Backend details for these are generic English; prefer our own copy.
const STATUS_MESSAGE_IDS: Record<number, string> = {
  403: "importExport.import.forbidden",
  409: "importExport.import.conflict",
  413: "importExport.import.tooLarge",
  422: "importExport.import.validationFailed",
};

function importErrorMessage(err: unknown, intl: IntlShape): string {
  const id = err instanceof ApiError ? STATUS_MESSAGE_IDS[err.status] : undefined;
  return id
    ? intl.formatMessage({ id })
    : parseApiError(err, intl.formatMessage({ id: "importExport.import.failed" }));
}

export function useImportConfig(): ImportConfigState {
  const intl = useIntl();
  const { hasPermission } = useAuth();
  const canImport = hasPermission("admin.import");
  const [data, setData] = useState<ConfigExport | null>(null);
  const [dryRunResult, setDryRunResult] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors `data` so submit can run right after loadFile resolves, before a re-render.
  const dataRef = useRef<ConfigExport | null>(null);
  // Bumped by every reset/new load; a file read that finishes under an older value is dropped.
  const loadGenRef = useRef(0);

  const abortCurrent = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Shared by dryRun and runImport; only the flag and the result slot differ.
  const submit = useCallback(
    async (opts: ImportRunOptions, dryRun: boolean): Promise<ImportResult | null> => {
      const data = dataRef.current;
      if (!data) return null;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const value = await importExportApi.importConfig(
          { ...opts, data, dryRun },
          controller.signal,
        );
        if (controller.signal.aborted) return null;
        (dryRun ? setDryRunResult : setResult)(value);
        return value;
      } catch (err) {
        if (!controller.signal.aborted) setError(importErrorMessage(err, intl));
        return null;
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
    loadGenRef.current += 1;
    abortCurrent();
    dataRef.current = null;
    setData(null);
    setDryRunResult(null);
    setResult(null);
    setError(null);
  }, [abortCurrent]);

  const loadFile = useCallback(
    async (file: File) => {
      reset();
      const gen = loadGenRef.current;
      try {
        const parsed = await parseImportFile(file);
        if (gen !== loadGenRef.current) return null;
        dataRef.current = parsed;
        setData(parsed);
        return parsed;
      } catch (err) {
        if (gen !== loadGenRef.current) return null;
        // Anything else is the browser failing to read the file.
        const id = !(err instanceof ImportFileError)
          ? "importExport.import.failed"
          : err.code === "invalid_json"
            ? "importExport.import.invalidJson"
            : "importExport.import.invalidShape";
        setError(intl.formatMessage({ id }));
        return null;
      }
    },
    [intl, reset],
  );

  const dryRun = useCallback((opts: ImportRunOptions = {}) => submit(opts, true), [submit]);
  const runImport = useCallback((opts: ImportRunOptions = {}) => submit(opts, false), [submit]);

  return {
    loadFile,
    dryRun,
    runImport,
    reset,
    data,
    dryRunResult,
    result,
    isLoading,
    error,
    canImport,
  };
}
