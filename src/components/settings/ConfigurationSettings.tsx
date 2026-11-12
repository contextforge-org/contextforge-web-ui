import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { useIntl, type IntlShape } from "react-intl";
import { toast } from "sonner";
import {
  ArrowDownFromLine,
  ArrowUpFromLine,
  Box,
  ChevronRight,
  FolderRoot,
  MessageSquareCode,
  Server,
  Wrench,
} from "lucide-react";
import { MCPIcon } from "@/components/icons/MCPIcon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConfigExport, ExportEntityType } from "@/api/importExport";
import { importOutcome, useImportConfig } from "@/hooks/useImportConfig";
import { useExportConfig } from "@/hooks/useExportConfig";

const OUTCOME_TOAST = { success: toast.success, partial: toast.warning, failed: toast.error };
const IMPORT_MESSAGE = {
  success: "settings.configuration.import.success",
  partial: "settings.configuration.import.partial",
  failed: "settings.configuration.import.allFailed",
};

// Same icons as the sidebar. No agents row: the backend can't export A2A agents.
const EXPORT_ROWS: { type: ExportEntityType; icon: ComponentType<{ className?: string }> }[] = [
  { type: "gateways", icon: MCPIcon },
  { type: "servers", icon: Server },
  { type: "tools", icon: Wrench },
  { type: "resources", icon: Box },
  { type: "prompts", icon: MessageSquareCode },
  { type: "roots", icon: FolderRoot },
];
const EXPORT_TYPES = EXPORT_ROWS.map((r) => r.type);
const CHECKBOX_CLASS = "size-4 [&_svg]:size-3.5";

// Entities of types the UI doesn't list yet (e.g. A2A agents once the backend exports them).
const otherCount = (data: ConfigExport) =>
  Object.entries(data.entities)
    .filter(([type]) => !EXPORT_TYPES.includes(type as ExportEntityType))
    .reduce((sum, [, list]) => sum + (list?.length ?? 0), 0);

// Per-type split of the file's contents; the backend reports only aggregate counts.
function typeSummary(data: ConfigExport, intl: IntlShape): string | null {
  const items = EXPORT_TYPES.filter((t) => data.entities[t]?.length).map((t) =>
    intl.formatMessage(
      { id: `settings.configuration.type.${t}` },
      { count: data.entities[t]!.length },
    ),
  );
  const others = otherCount(data);
  if (others)
    items.push(intl.formatMessage({ id: "settings.configuration.type.other" }, { count: others }));
  return items.length ? intl.formatList(items, { type: "conjunction" }) : null;
}

export function ConfigurationSettings() {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <ExportSection />
      <ImportSection />
    </div>
  );
}

function ExportSection() {
  const intl = useIntl();
  const uid = useId();
  const title = intl.formatMessage({ id: "settings.configuration.export.title" });
  const { previewAll, download, isExporting, error, canExport } = useExportConfig();
  // Types snapshotted with the data, so the dialog lists what was actually requested.
  const [preview, setPreview] = useState<{ data: ConfigExport; types: ExportEntityType[] } | null>(
    null,
  );
  // Kept apart from `preview` so counts don't blank out during the close animation.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [types, setTypes] = useState<ExportEntityType[]>(EXPORT_TYPES);
  const [includeInactive, setIncludeInactive] = useState(false);
  const allState =
    types.length === EXPORT_TYPES.length ? true : types.length ? "indeterminate" : false;

  const toggle = (type: ExportEntityType, on: boolean) =>
    setTypes((prev) =>
      on
        ? EXPORT_TYPES.filter((t) => t === type || prev.includes(t))
        : prev.filter((t) => t !== type),
    );

  const submit = async () => {
    // All picked = unfiltered export, so types added server-side later aren't dropped.
    // Fetch first; the dialog shows what's in it and Download saves this same data.
    const data = await previewAll({
      types: types.length === EXPORT_TYPES.length ? undefined : types,
      includeInactive,
    });
    if (!data) return;
    if (!Object.values(data.entities).some((list) => list?.length)) {
      toast.info(intl.formatMessage({ id: "settings.configuration.export.empty" }));
      return;
    }
    setPreview({ data, types });
    setConfirmOpen(true);
  };

  const confirmDownload = () => {
    setConfirmOpen(false);
    if (!preview) return;
    try {
      download(preview.data);
    } catch {
      toast.error(intl.formatMessage({ id: "importExport.export.failed" }));
      return;
    }
    toast.success(intl.formatMessage({ id: "settings.configuration.export.success" }));
  };
  const others = preview ? otherCount(preview.data) : 0;

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  return (
    <section className="flex flex-col items-start gap-2 rounded-lg border p-6">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="flex size-6 items-center justify-center rounded-sm bg-config-export-icon-bg text-black">
            <ArrowUpFromLine className="size-4" aria-hidden />
          </span>
          {title}
        </h2>
        <label className="flex items-center gap-3 text-[13px] leading-4 text-muted-foreground">
          <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
          {intl.formatMessage({ id: "settings.configuration.export.includeInactive" })}
        </label>
      </div>
      <p className="py-4 text-[13px] leading-4">
        {intl.formatMessage({ id: "settings.configuration.export.description" })}
      </p>
      <div className="w-full pb-4">
        <details className="group rounded-md border">
          <summary className="flex h-10 cursor-pointer list-none items-center gap-2 px-3 text-[13px] leading-4 font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="size-3.5 transition-transform group-open:rotate-90"
              aria-hidden
            />
            {intl.formatMessage({ id: "settings.configuration.export.include" })}
          </summary>
          <div className="grid grid-cols-[1rem_9rem_minmax(0,1fr)] items-center gap-x-6 px-3 pb-2 text-[13px] leading-4 font-medium">
            <label className="col-span-full grid h-8 grid-cols-subgrid items-center">
              <Checkbox
                className={CHECKBOX_CLASS}
                checked={allState}
                onCheckedChange={() => setTypes(allState === true ? [] : EXPORT_TYPES)}
              />
              <span className="col-span-2">
                {intl.formatMessage({ id: "settings.configuration.export.all" })}
              </span>
            </label>
            {EXPORT_ROWS.map(({ type, icon: Icon }) => {
              const desc = intl.formatMessage({ id: `settings.configuration.export.desc.${type}` });
              return (
                <label key={type} className="col-span-full grid h-8 grid-cols-subgrid items-center">
                  <Checkbox
                    className={CHECKBOX_CLASS}
                    checked={types.includes(type)}
                    onCheckedChange={(on) => toggle(type, on === true)}
                    aria-labelledby={`${uid}-${type}-label`}
                    aria-describedby={`${uid}-${type}-desc`}
                  />
                  <span
                    id={`${uid}-${type}-label`}
                    className="flex w-fit items-center gap-1.5 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground"
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {intl.formatMessage({ id: `settings.configuration.export.label.${type}` })}
                  </span>
                  <span
                    id={`${uid}-${type}-desc`}
                    className="truncate text-muted-foreground"
                    title={desc}
                  >
                    {desc}
                  </span>
                </label>
              );
            })}
          </div>
        </details>
      </div>
      <Button
        size="sm"
        disabled={!canExport || isExporting || !types.length}
        aria-busy={isExporting}
        onClick={submit}
      >
        {isExporting
          ? intl.formatMessage({ id: "settings.configuration.export.exporting" })
          : title}
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {/* Fires after the close animation; frees the export data. */}
        <DialogContent className="gap-4 rounded-xl p-6" onCloseAutoFocus={() => setPreview(null)}>
          <DialogHeader className="space-y-4">
            <DialogTitle className="flex items-center gap-2 text-sm font-medium leading-5 tracking-normal">
              <span className="flex size-6 items-center justify-center rounded-sm bg-config-export-icon-bg text-black">
                <ArrowUpFromLine className="size-4" aria-hidden />
              </span>
              {intl.formatMessage({ id: "settings.configuration.export.confirm.title" })}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-4">
              {intl.formatMessage({ id: "settings.configuration.export.confirm.description" })}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[100px_1fr] items-center gap-x-2 gap-y-2 py-2 leading-4">
            {EXPORT_ROWS.filter(({ type }) => preview?.types.includes(type)).map(({ type }) => (
              <div key={type} className="contents">
                <dt className="text-xs">
                  {intl.formatMessage({ id: `settings.configuration.export.label.${type}` })}
                </dt>
                <dd className="text-[13px] text-secondary-foreground">
                  {preview?.data.entities[type]?.length ?? 0}
                </dd>
              </div>
            ))}
            {others > 0 && (
              <div className="contents">
                <dt className="text-xs">
                  {intl.formatMessage({ id: "settings.configuration.export.label.other" })}
                </dt>
                <dd className="text-[13px] text-secondary-foreground">{others}</dd>
              </div>
            )}
          </dl>
          <Separator />
          <DialogFooter className="gap-4 py-1 sm:space-x-0">
            <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>
              {intl.formatMessage({ id: "common.button.cancel" })}
            </Button>
            <Button size="sm" onClick={confirmDownload}>
              {intl.formatMessage({ id: "settings.configuration.export.confirm.download" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ImportSection() {
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
    <section className="flex flex-col items-start gap-2 rounded-lg border p-6">
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
