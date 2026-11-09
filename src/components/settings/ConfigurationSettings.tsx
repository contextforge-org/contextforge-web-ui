import { useEffect, useRef } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";
import { ArrowDownFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfigExport, ExportEntityType } from "@/api/importExport";
import { importOutcome, useImportConfig } from "@/hooks/useImportConfig";

const OUTCOME_TOAST = {
  success: { fn: toast.success, id: "settings.configuration.import.success" },
  partial: { fn: toast.warning, id: "settings.configuration.import.partial" },
  failed: { fn: toast.error, id: "settings.configuration.import.allFailed" },
} as const;

const TYPE_ORDER: ExportEntityType[] = [
  "gateways",
  "servers",
  "tools",
  "prompts",
  "resources",
  "roots",
];

// Backend reports only aggregate counts (and none on dry run), so the per-type
// split comes from the file; it matches what's processed since we never send selected_entities.
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
  const { loadFile, runImport, dryRun, reset, data, isLoading, error, canImport } =
    useImportConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const dryRunRef = useRef(false); // which button opened the picker

  // Submit as soon as a file parses; reset after so data can't re-trigger it.
  useEffect(() => {
    if (!data) return;
    const isDry = dryRunRef.current;
    const items = typeSummary(data, intl);
    void (isDry ? dryRun : runImport)().then((result) => {
      if (!result) return;
      const { fn, id } = OUTCOME_TOAST[importOutcome(result)];
      fn(
        !items
          ? intl.formatMessage({ id: "settings.configuration.empty" })
          : intl.formatMessage(
              { id: isDry ? "settings.configuration.dryRun.result" : id },
              { ...result.progress, items },
            ),
      );
      reset();
    });
  }, [data, runImport, dryRun, reset, intl]);

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
          if (file) void loadFile(file);
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
