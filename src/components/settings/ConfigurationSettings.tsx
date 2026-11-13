import { useEffect, useRef } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";
import { ArrowDownFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfigExport, ExportEntityType } from "@/api/importExport";
import { importOutcome, useImportConfig } from "@/hooks/useImportConfig";

const OUTCOME_TOAST = { success: toast.success, partial: toast.warning, failed: toast.error };
const IMPORT_MESSAGE = {
  success: "settings.configuration.import.success",
  partial: "settings.configuration.import.partial",
  failed: "settings.configuration.import.allFailed",
};

const TYPE_ORDER: ExportEntityType[] = [
  "gateways",
  "servers",
  "tools",
  "prompts",
  "resources",
  "roots",
];

// Per-type split of the file's contents; the backend reports only aggregate counts.
function typeSummary(data: ConfigExport, intl: IntlShape): string | null {
  const items = TYPE_ORDER.filter((t) => data.entities[t]?.length).map((t) =>
    intl.formatMessage(
      { id: `settings.configuration.type.${t}` },
      { count: data.entities[t]!.length },
    ),
  );
  return items.length ? intl.formatList(items, { type: "conjunction" }) : null;
}

export function ConfigurationSettings() {
  const intl = useIntl();
  const title = intl.formatMessage({ id: "settings.configuration.import.title" });
  const { loadFile, runImport, dryRun, reset, isLoading, error, canImport } = useImportConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const dryRunRef = useRef(false); // which button opened the picker

  const submit = async (file: File) => {
    const isDry = dryRunRef.current;
    const data = await loadFile(file);
    if (!data) return;
    const items = typeSummary(data, intl);
    if (!items) {
      toast.info(intl.formatMessage({ id: "settings.configuration.empty" }));
      return reset();
    }
    const result = await (isDry ? dryRun : runImport)();
    if (!result) return;
    const outcome = importOutcome(result);
    const id = !isDry
      ? IMPORT_MESSAGE[outcome]
      : outcome === "success"
        ? "settings.configuration.dryRun.result"
        : "settings.configuration.dryRun.failed";
    OUTCOME_TOAST[outcome](intl.formatMessage({ id }, { ...result.progress, items }));
    reset();
  };

  const pick = (isDry: boolean) => {
    dryRunRef.current = isDry;
    inputRef.current?.click();
  };

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  return (
    <section className="flex flex-col items-start gap-2 rounded-lg border p-6 mt-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex size-6 items-center justify-center rounded-sm bg-config-icon-bg text-black">
          <ArrowDownFromLine className="size-4" aria-hidden />
        </span>
        {title}
      </h2>
      <p className="py-4 text-[13px] leading-4">
        {intl.formatMessage({ id: "settings.configuration.import.description" })}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="import-config-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-picking the same file
          if (file) void submit(file);
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={!canImport || isLoading} onClick={() => pick(false)}>
          {title}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canImport || isLoading}
          onClick={() => pick(true)}
        >
          {intl.formatMessage({ id: "settings.configuration.dryRun.title" })}
        </Button>
      </div>
    </section>
  );
}
