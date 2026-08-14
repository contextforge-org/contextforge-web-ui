import { useCallback, useId, useState } from "react";
import { Filter } from "lucide-react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { CardTag } from "@/components/ui/card-tag";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ListSearch } from "@/components/ui/list-search";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const ALL_MODE = "all";
const SELECT_MODE = "select";

export interface PluginFilterDraft {
  hook: string[];
  tags: string[];
}

type PluginFilterSection = keyof PluginFilterDraft;
type PluginSectionMode = typeof ALL_MODE | typeof SELECT_MODE;
type PluginSectionModes = Record<PluginFilterSection, PluginSectionMode>;

function getSectionModes(draft: PluginFilterDraft): PluginSectionModes {
  return {
    hook: draft.hook.length > 0 ? SELECT_MODE : ALL_MODE,
    tags: draft.tags.length > 0 ? SELECT_MODE : ALL_MODE,
  };
}

interface PluginToolbarProps {
  search: string;
  enabledOnly: boolean;
  hook: string[];
  selectedTags: string[];
  hooks: string[];
  availableTags: string[];
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onEnabledOnlyChange: (enabledOnly: boolean) => void;
  onApply: (draft: PluginFilterDraft) => void;
}

function PluginViewToggle({
  enabledOnly,
  onChange,
}: {
  enabledOnly: boolean;
  onChange: (enabledOnly: boolean) => void;
}) {
  const intl = useIntl();

  return (
    <div
      role="group"
      aria-label={intl.formatMessage({ id: "plugins.catalog.viewOptions" })}
      className="flex h-10 w-full gap-0 rounded-md bg-muted p-1 sm:w-[292px]"
    >
      <Button
        type="button"
        variant="ghost"
        aria-pressed={!enabledOnly}
        className="h-8 flex-1 rounded-md font-medium aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
        onClick={() => onChange(false)}
      >
        {intl.formatMessage({ id: "plugins.catalog.all" })}
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-pressed={enabledOnly}
        className="h-8 flex-1 rounded-md font-medium aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
        onClick={() => onChange(true)}
      >
        {intl.formatMessage({ id: "plugins.catalog.enabled" })}
      </Button>
    </div>
  );
}

// Tailwind's scanner needs literal class names, so column counts are looked up
// rather than interpolated (e.g. `md:columns-${n}` would be silently dropped).
const COLUMNS_CLASS: Record<3 | 4, string> = {
  3: "columns-2 gap-x-4 pl-6 md:columns-3",
  4: "columns-2 gap-x-4 pl-6 md:columns-4",
};

function PluginFilterSectionFields({
  idPrefix,
  legendId,
  legend,
  options,
  selected,
  mode,
  allLabel,
  selectLabel,
  onModeChange,
  onToggle,
  maxColumns = 4,
}: {
  idPrefix: string;
  legendId: string;
  legend: string;
  options: string[];
  selected: string[];
  mode: PluginSectionMode;
  allLabel: string;
  selectLabel: string;
  onModeChange: (mode: string) => void;
  onToggle: (option: string, checked: boolean) => void;
  maxColumns?: 3 | 4;
}) {
  return (
    <fieldset className="space-y-3" aria-labelledby={legendId}>
      <legend id={legendId} className="text-sm font-medium text-foreground">
        {legend}
      </legend>

      <RadioGroup value={mode} onValueChange={onModeChange} className="gap-2">
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${idPrefix}-all`} value={ALL_MODE} />
          <Label htmlFor={`${idPrefix}-all`} className="cursor-pointer text-sm font-normal">
            {allLabel}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${idPrefix}-select`} value={SELECT_MODE} />
          <Label htmlFor={`${idPrefix}-select`} className="cursor-pointer text-sm font-normal">
            {selectLabel}
          </Label>
        </div>
      </RadioGroup>

      {mode === SELECT_MODE && (
        // Multi-column rather than a grid so options read alphabetically down
        // each column, as the design lays them out. min-w-0 plus
        // overflow-wrap:anywhere lets long, space-free option names (e.g. hook
        // identifiers like "http_auth_resolve_user") wrap inside their column
        // instead of forcing the column — and the dialog — wider, which used to
        // push a horizontal scrollbar onto the whole dialog.
        <div className={COLUMNS_CLASS[maxColumns]}>
          {options.map((option, index) => {
            const checkboxId = `${idPrefix}-option-${index}`;
            return (
              <div key={option} className="flex break-inside-avoid items-start gap-2 pb-2">
                <Checkbox
                  id={checkboxId}
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) => onToggle(option, checked === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor={checkboxId}
                  className="min-w-0 cursor-pointer text-sm font-normal [overflow-wrap:anywhere]"
                >
                  {option}
                </Label>
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function PluginFiltersDialog({
  hook,
  selectedTags,
  hooks,
  availableTags,
  activeFilterCount,
  onApply,
}: Omit<PluginToolbarProps, "search" | "enabledOnly" | "onSearchChange" | "onEnabledOnlyChange">) {
  const intl = useIntl();
  const id = useId();
  const [open, setOpen] = useState(false);
  const initialDraft: PluginFilterDraft = { hook, tags: selectedTags };
  const [draft, setDraft] = useState<PluginFilterDraft>(initialDraft);
  const [sectionModes, setSectionModes] = useState<PluginSectionModes>(() =>
    getSectionModes(initialDraft),
  );

  // Seeded only when the dialog opens. The page re-renders on every debounced
  // search keystroke, so syncing the draft in an effect would discard edits that
  // are still in progress.
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const committed: PluginFilterDraft = { hook, tags: selectedTags };
        setDraft(committed);
        setSectionModes(getSectionModes(committed));
      }
      setOpen(nextOpen);
    },
    [hook, selectedTags],
  );

  const setSectionMode = useCallback((section: PluginFilterSection, nextMode: string) => {
    const resolvedMode: PluginSectionMode = nextMode === SELECT_MODE ? SELECT_MODE : ALL_MODE;
    setSectionModes((previous) => ({ ...previous, [section]: resolvedMode }));
    // Switching a section back to All clears that section and leaves the others
    // untouched. Switching to Select keeps whatever was already ticked.
    if (resolvedMode === ALL_MODE) {
      setDraft((previous) => ({ ...previous, [section]: [] }));
    }
  }, []);

  const toggleSectionOption = useCallback(
    (section: PluginFilterSection, option: string, checked: boolean) => {
      // Ticking a box always implies Select mode for that section.
      if (checked) setSectionModes((previous) => ({ ...previous, [section]: SELECT_MODE }));
      setDraft((previous) => {
        const current = previous[section];
        return {
          ...previous,
          [section]: checked ? [...current, option] : current.filter((item) => item !== option),
        };
      });
    },
    [],
  );

  const handleApply = useCallback(() => {
    onApply(draft);
    setOpen(false);
  }, [draft, onApply]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit gap-2 self-center text-xs text-secondary-foreground"
          aria-label={intl.formatMessage(
            { id: "plugins.catalog.filtersActive" },
            { count: activeFilterCount },
          )}
        >
          <Filter className="size-3.5" aria-hidden="true" />
          {intl.formatMessage({ id: "plugins.catalog.filters" })}
          {activeFilterCount > 0 && (
            <CardTag variant="neutral" className="rounded-full" aria-hidden="true">
              {activeFilterCount}
            </CardTag>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[696px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-selection">
              <Filter className="size-4 text-black" aria-hidden="true" />
            </span>
            {intl.formatMessage({ id: "common.addFilters" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <PluginFilterSectionFields
            idPrefix={`${id}-hook`}
            legendId={`${id}-hook-legend`}
            legend={intl.formatMessage({ id: "plugins.catalog.hooks" })}
            options={hooks}
            selected={draft.hook}
            mode={sectionModes.hook}
            allLabel={intl.formatMessage({ id: "plugins.catalog.allHooksOption" })}
            selectLabel={intl.formatMessage({ id: "common.selectOption" })}
            onModeChange={(nextMode) => setSectionMode("hook", nextMode)}
            onToggle={(option, checked) => toggleSectionOption("hook", option, checked)}
            maxColumns={3}
          />

          {availableTags.length > 0 && (
            <PluginFilterSectionFields
              idPrefix={`${id}-tags`}
              legendId={`${id}-tags-legend`}
              legend={intl.formatMessage({ id: "plugins.catalog.tags" })}
              options={availableTags}
              selected={draft.tags}
              mode={sectionModes.tags}
              allLabel={intl.formatMessage({ id: "plugins.catalog.allTagsOption" })}
              selectLabel={intl.formatMessage({ id: "common.selectOption" })}
              onModeChange={(nextMode) => setSectionMode("tags", nextMode)}
              onToggle={(option, checked) => toggleSectionOption("tags", option, checked)}
            />
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {intl.formatMessage({ id: "common.button.cancel" })}
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleApply}>
            {intl.formatMessage({ id: "common.addFilters" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PluginToolbar({
  search,
  enabledOnly,
  onSearchChange,
  onEnabledOnlyChange,
  ...filterProps
}: PluginToolbarProps) {
  const intl = useIntl();

  return (
    <div className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
      <PluginViewToggle enabledOnly={enabledOnly} onChange={onEnabledOnlyChange} />

      <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
        <ListSearch
          value={search}
          onChange={onSearchChange}
          ariaLabel={intl.formatMessage({ id: "plugins.catalog.searchLabel" })}
          placeholder={intl.formatMessage({ id: "plugins.catalog.searchPlaceholder" })}
          className="w-full sm:w-auto"
          expandedWidthClassName="w-full sm:w-[432px]"
        />

        <PluginFiltersDialog {...filterProps} />
      </div>
    </div>
  );
}
