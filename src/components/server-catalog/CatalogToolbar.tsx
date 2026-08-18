import { useCallback, useId, useState, type ReactNode } from "react";
import { Filter } from "lucide-react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { CardTag } from "@/components/ui/card-tag";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ListSearch } from "@/components/ui/list-search";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const ALL_MODE = "all";
const SELECT_MODE = "select";

export type CatalogFilterSection = "category" | "provider" | "tags";

type CatalogSectionMode = typeof ALL_MODE | typeof SELECT_MODE;
type CatalogSectionModes = Record<CatalogFilterSection, CatalogSectionMode>;

const DEFAULT_MODES: CatalogSectionModes = {
  category: ALL_MODE,
  provider: SELECT_MODE,
  tags: ALL_MODE,
};

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
  onToggleOption: (section: CatalogFilterSection, option: string, checked: boolean) => void;
  onClearSection: (section: CatalogFilterSection) => void;
  onClearAll: () => void;
}

type CatalogFiltersPopoverProps = Omit<
  CatalogToolbarProps,
  "search" | "installedOnly" | "onSearchChange" | "onInstalledChange"
>;

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
  expanded,
  allLabel,
  selectLabel,
  headerAction,
  onModeChange,
  onExpand,
  onToggle,
}: {
  idPrefix: string;
  legendId: string;
  legend: string;
  options: string[];
  selected: string[];
  mode: CatalogSectionMode;
  expanded: boolean;
  allLabel: string;
  selectLabel: string;
  headerAction?: ReactNode;
  onModeChange: (mode: string) => void;
  onExpand: () => void;
  onToggle: (option: string, checked: boolean) => void;
}) {
  return (
    // role=group rather than fieldset so the section heading can share a row with
    // the panel-level Clear all button, which a legend cannot do.
    <div role="group" aria-labelledby={legendId} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span id={legendId} className="text-sm font-medium text-foreground">
          {legend}
        </span>
        {headerAction}
      </div>

      <RadioGroup value={mode} onValueChange={onModeChange} className="gap-2">
        <div className="flex items-center gap-2">
          <RadioGroupItem id={`${idPrefix}-all`} value={ALL_MODE} />
          <Label htmlFor={`${idPrefix}-all`} className="cursor-pointer text-sm font-normal">
            {allLabel}
          </Label>
        </div>
        <div className="flex min-h-6 items-center gap-2">
          {/* Clicking Select also re-expands a section that was collapsed when
              another one was opened, so onValueChange alone is not enough: Radix
              does not fire it when the already-checked radio is clicked again.
              The label forwards its click to this button, so it is covered too. */}
          <RadioGroupItem id={`${idPrefix}-select`} value={SELECT_MODE} onClick={onExpand} />
          <Label htmlFor={`${idPrefix}-select`} className="cursor-pointer text-sm font-normal">
            {selectLabel}
          </Label>
          {selected.length > 0 && (
            <CardTag variant="neutral" className="rounded-full" aria-hidden="true">
              {selected.length}
            </CardTag>
          )}
        </div>
      </RadioGroup>

      {mode === SELECT_MODE && expanded && (
        // A grid rather than CSS columns: a height-capped multi-column box
        // overflows sideways into new columns instead of scrolling down.
        <div className="scrollbar-thin grid max-h-52 grid-cols-1 gap-x-4 overflow-y-auto rounded-md border p-2 @sm:grid-cols-2 @lg:grid-cols-3">
          {options.map((option, index) => {
            const checkboxId = `${idPrefix}-option-${index}`;
            return (
              <div key={option} className="flex min-w-0 items-center gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) => onToggle(option, checked === true)}
                />
                {/* Full-height label so the tap target clears 44px on touch. */}
                <Label
                  htmlFor={checkboxId}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center break-words text-sm font-normal sm:min-h-8"
                >
                  {option}
                </Label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CatalogFiltersPopover({
  category,
  provider,
  selectedTags,
  categories,
  providers,
  availableTags,
  activeFilterCount,
  onToggleOption,
  onClearSection,
  onClearAll,
}: CatalogFiltersPopoverProps) {
  const intl = useIntl();
  const id = useId();
  const [modes, setModes] = useState<CatalogSectionModes>(DEFAULT_MODES);
  // Only one section shows its options at a time; the rest collapse to their
  // Select row and selection count, so every section stays reachable without
  // scrolling the panel.
  const [expanded, setExpanded] = useState<CatalogFilterSection | null>("provider");

  // Seeded when the popover opens so a section the user collapsed during an
  // earlier visit does not stay collapsed over a selection made since. Providers
  // always opens expanded, which is how the design draws the default state.
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) return;
      setModes({
        category: category.length > 0 ? SELECT_MODE : ALL_MODE,
        provider: SELECT_MODE,
        tags: selectedTags.length > 0 ? SELECT_MODE : ALL_MODE,
      });
      setExpanded("provider");
    },
    [category.length, selectedTags.length],
  );

  const setSectionMode = useCallback(
    (section: CatalogFilterSection, mode: string) => {
      const nextMode: CatalogSectionMode = mode === SELECT_MODE ? SELECT_MODE : ALL_MODE;
      setModes((previous) => ({ ...previous, [section]: nextMode }));
      // Switching a section back to All drops that section's filter and leaves
      // the others untouched.
      if (nextMode === ALL_MODE) {
        onClearSection(section);
        setExpanded((previous) => (previous === section ? null : previous));
        return;
      }
      setExpanded(section);
    },
    [onClearSection],
  );

  // Clear all returns the panel to the state a fresh open would show rather than
  // leaving every section collapsed behind an All radio.
  const handleClearAll = useCallback(() => {
    onClearAll();
    setModes(DEFAULT_MODES);
    setExpanded("provider");
  }, [onClearAll]);

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      {/* End-aligned because the trigger sits at the toolbar's right edge, where a
          start-aligned panel would expand past the viewport. The panel carries no
          visible title, so it is named for assistive tech instead. */}
      <PopoverContent
        align="end"
        className="@container flex w-[calc(100vw-2rem)] flex-col gap-6 md:w-[30rem] lg:w-[34rem]"
        aria-label={intl.formatMessage({ id: "mcpServer.catalog.filters" })}
      >
        <CatalogFilterSectionFields
          idPrefix={`${id}-provider`}
          legendId={`${id}-provider-legend`}
          legend={intl.formatMessage({ id: "mcpServer.catalog.providers" })}
          options={providers}
          selected={provider}
          mode={modes.provider}
          expanded={expanded === "provider"}
          allLabel={intl.formatMessage({ id: "mcpServer.catalog.allProvidersOption" })}
          selectLabel={intl.formatMessage({ id: "mcpServer.catalog.selectProviders" })}
          // The panel has no visible title, so Clear all rides the first section's
          // heading row, which is where the design places it.
          headerAction={
            activeFilterCount > 0 && (
              <Button type="button" variant="outline" size="xs" onClick={handleClearAll}>
                {intl.formatMessage({ id: "mcpServer.catalog.clearAllFilters" })}
              </Button>
            )
          }
          onModeChange={(mode) => setSectionMode("provider", mode)}
          onExpand={() => setExpanded("provider")}
          onToggle={(option, checked) => onToggleOption("provider", option, checked)}
        />

        <CatalogFilterSectionFields
          idPrefix={`${id}-category`}
          legendId={`${id}-category-legend`}
          legend={intl.formatMessage({ id: "mcpServer.catalog.categories" })}
          options={categories}
          selected={category}
          mode={modes.category}
          expanded={expanded === "category"}
          allLabel={intl.formatMessage({ id: "mcpServer.catalog.allCategoriesOption" })}
          selectLabel={intl.formatMessage({ id: "mcpServer.catalog.selectCategories" })}
          onModeChange={(mode) => setSectionMode("category", mode)}
          onExpand={() => setExpanded("category")}
          onToggle={(option, checked) => onToggleOption("category", option, checked)}
        />

        {availableTags.length > 0 && (
          <CatalogFilterSectionFields
            idPrefix={`${id}-tags`}
            legendId={`${id}-tags-legend`}
            legend={intl.formatMessage({ id: "mcpServer.catalog.tags" })}
            options={availableTags}
            selected={selectedTags}
            mode={modes.tags}
            expanded={expanded === "tags"}
            allLabel={intl.formatMessage({ id: "mcpServer.catalog.allTagsOption" })}
            selectLabel={intl.formatMessage({ id: "mcpServer.catalog.selectTags" })}
            onModeChange={(mode) => setSectionMode("tags", mode)}
            onExpand={() => setExpanded("tags")}
            onToggle={(option, checked) => onToggleOption("tags", option, checked)}
          />
        )}
      </PopoverContent>
    </Popover>
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

        <CatalogFiltersPopover {...filterProps} />
      </div>
    </div>
  );
}
