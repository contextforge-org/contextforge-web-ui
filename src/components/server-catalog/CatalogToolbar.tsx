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

export interface CatalogFilterDraft {
  category: string[];
  provider: string[];
  tags: string[];
}

type CatalogFilterSection = keyof CatalogFilterDraft;
type CatalogSectionMode = typeof ALL_MODE | typeof SELECT_MODE;
type CatalogSectionModes = Record<CatalogFilterSection, CatalogSectionMode>;

function getSectionModes(draft: CatalogFilterDraft): CatalogSectionModes {
  return {
    category: draft.category.length > 0 ? SELECT_MODE : ALL_MODE,
    provider: draft.provider.length > 0 ? SELECT_MODE : ALL_MODE,
    tags: draft.tags.length > 0 ? SELECT_MODE : ALL_MODE,
  };
}

interface CatalogToolbarProps {
  search: string;
  installedOnly: boolean;
  category: string[];
  provider: string[];
  selectedTags: string[];
  categories: string[];
  providers: string[];
  availableTags: string[];
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onInstalledChange: (installedOnly: boolean) => void;
  onApply: (draft: CatalogFilterDraft) => void;
}

function CatalogViewToggle({
  installedOnly,
  onChange,
}: {
  installedOnly: boolean;
  onChange: (installedOnly: boolean) => void;
}) {
  const intl = useIntl();

  return (
    <div
      role="group"
      aria-label={intl.formatMessage({ id: "mcpServer.catalog.viewOptions" })}
      className="flex h-10 w-full gap-0 rounded-md bg-muted p-1 sm:w-[292px]"
    >
      <Button
        type="button"
        variant="ghost"
        aria-pressed={!installedOnly}
        className="h-8 flex-1 rounded-md font-medium aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
        onClick={() => onChange(false)}
      >
        {intl.formatMessage({ id: "mcpServer.catalog.all" })}
      </Button>
      <Button
        type="button"
        variant="ghost"
        aria-pressed={installedOnly}
        className="h-8 flex-1 rounded-md font-medium aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
        onClick={() => onChange(true)}
      >
        {intl.formatMessage({ id: "mcpServer.catalog.connected" })}
      </Button>
    </div>
  );
}

function CatalogFilterSectionFields({
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
}: {
  idPrefix: string;
  legendId: string;
  legend: string;
  options: string[];
  selected: string[];
  mode: CatalogSectionMode;
  allLabel: string;
  selectLabel: string;
  onModeChange: (mode: string) => void;
  onToggle: (option: string, checked: boolean) => void;
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
        // each column, as the design lays them out.
        <div className="columns-2 gap-x-4 pl-6 md:columns-4">
          {options.map((option, index) => {
            const checkboxId = `${idPrefix}-option-${index}`;
            return (
              <div key={option} className="flex break-inside-avoid items-center gap-2 pb-2">
                <Checkbox
                  id={checkboxId}
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) => onToggle(option, checked === true)}
                />
                <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-normal">
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

function CatalogFiltersDialog({
  category,
  provider,
  selectedTags,
  categories,
  providers,
  availableTags,
  activeFilterCount,
  onApply,
}: Omit<CatalogToolbarProps, "search" | "installedOnly" | "onSearchChange" | "onInstalledChange">) {
  const intl = useIntl();
  const id = useId();
  const [open, setOpen] = useState(false);
  const initialDraft: CatalogFilterDraft = { category, provider, tags: selectedTags };
  const [draft, setDraft] = useState<CatalogFilterDraft>(initialDraft);
  const [modes, setModes] = useState<CatalogSectionModes>(() => getSectionModes(initialDraft));

  // Seeded only when the dialog opens. The page re-renders on every debounced
  // search keystroke, so syncing the draft in an effect would discard edits that
  // are still in progress.
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const committed: CatalogFilterDraft = { category, provider, tags: selectedTags };
        setDraft(committed);
        setModes(getSectionModes(committed));
      }
      setOpen(nextOpen);
    },
    [category, provider, selectedTags],
  );

  const setSectionMode = useCallback((section: CatalogFilterSection, mode: string) => {
    const nextMode: CatalogSectionMode = mode === SELECT_MODE ? SELECT_MODE : ALL_MODE;
    setModes((previous) => ({ ...previous, [section]: nextMode }));
    // Switching a section back to All clears that section and leaves the others
    // untouched. Switching to Select keeps whatever was already ticked.
    if (nextMode === ALL_MODE) {
      setDraft((previous) => ({ ...previous, [section]: [] }));
    }
  }, []);

  const toggleSectionOption = useCallback(
    (section: CatalogFilterSection, option: string, checked: boolean) => {
      // Ticking a box always implies Select mode for that section.
      if (checked) setModes((previous) => ({ ...previous, [section]: SELECT_MODE }));
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
          className="w-fit shrink-0 gap-2 text-xs text-secondary-foreground"
          aria-label={intl.formatMessage(
            { id: "mcpServer.catalog.filtersActive" },
            { count: activeFilterCount },
          )}
        >
          <Filter className="size-3.5" aria-hidden="true" />
          {intl.formatMessage({ id: "mcpServer.catalog.filters" })}
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
            <Filter className="size-4" aria-hidden="true" />
            {intl.formatMessage({ id: "mcpServer.catalog.addFilters" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <CatalogFilterSectionFields
            idPrefix={`${id}-provider`}
            legendId={`${id}-provider-legend`}
            legend={intl.formatMessage({ id: "mcpServer.catalog.providers" })}
            options={providers}
            selected={draft.provider}
            mode={modes.provider}
            allLabel={intl.formatMessage({ id: "mcpServer.catalog.allProvidersOption" })}
            selectLabel={intl.formatMessage({ id: "mcpServer.catalog.selectProviders" })}
            onModeChange={(mode) => setSectionMode("provider", mode)}
            onToggle={(option, checked) => toggleSectionOption("provider", option, checked)}
          />

          <CatalogFilterSectionFields
            idPrefix={`${id}-category`}
            legendId={`${id}-category-legend`}
            legend={intl.formatMessage({ id: "mcpServer.catalog.categories" })}
            options={categories}
            selected={draft.category}
            mode={modes.category}
            allLabel={intl.formatMessage({ id: "mcpServer.catalog.allCategoriesOption" })}
            selectLabel={intl.formatMessage({ id: "mcpServer.catalog.selectCategories" })}
            onModeChange={(mode) => setSectionMode("category", mode)}
            onToggle={(option, checked) => toggleSectionOption("category", option, checked)}
          />

          {availableTags.length > 0 && (
            <CatalogFilterSectionFields
              idPrefix={`${id}-tags`}
              legendId={`${id}-tags-legend`}
              legend={intl.formatMessage({ id: "mcpServer.catalog.tags" })}
              options={availableTags}
              selected={draft.tags}
              mode={modes.tags}
              allLabel={intl.formatMessage({ id: "mcpServer.catalog.allTagsOption" })}
              selectLabel={intl.formatMessage({ id: "mcpServer.catalog.selectTags" })}
              onModeChange={(mode) => setSectionMode("tags", mode)}
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
            {intl.formatMessage({ id: "mcpServer.catalog.addFilters" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogToolbar({
  search,
  installedOnly,
  onSearchChange,
  onInstalledChange,
  ...filterProps
}: CatalogToolbarProps) {
  const intl = useIntl();

  return (
    <div className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between">
      <CatalogViewToggle installedOnly={installedOnly} onChange={onInstalledChange} />

      <div className="flex w-full items-center justify-end gap-2 lg:w-auto">
        <ListSearch
          value={search}
          onChange={onSearchChange}
          ariaLabel={intl.formatMessage({ id: "mcpServer.catalog.searchLabel" })}
          placeholder={intl.formatMessage({ id: "mcpServer.catalog.searchPlaceholder" })}
          className="min-w-0 flex-1 justify-end lg:flex-none"
          expandedWidthClassName="min-w-0 flex-1 lg:w-[432px] lg:flex-none"
        />

        <CatalogFiltersDialog {...filterProps} />
      </div>
    </div>
  );
}
