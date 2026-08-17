import { useId } from "react";
import { Filter } from "lucide-react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { CardTag } from "@/components/ui/card-tag";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ListSearch } from "@/components/ui/list-search";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_FILTER_VALUE = "__all__";

export type PluginSingleFilterKey = "hook";

interface PluginToolbarProps {
  search: string;
  enabledOnly: boolean;
  hook: string;
  selectedTags: string[];
  hooks: string[];
  availableTags: string[];
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onEnabledOnlyChange: (enabledOnly: boolean) => void;
  onSetSingleFilter: (key: PluginSingleFilterKey, value: string | null) => void;
  onToggleTag: (tag: string, checked: boolean) => void;
  onClear: () => void;
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

function PluginFiltersPopover({
  hook,
  selectedTags,
  hooks,
  availableTags,
  activeFilterCount,
  onSetSingleFilter,
  onToggleTag,
  onClear,
}: Omit<PluginToolbarProps, "search" | "enabledOnly" | "onSearchChange" | "onEnabledOnlyChange">) {
  const intl = useIntl();
  const id = useId();
  const filtersTitleId = `${id}-title`;
  const hookTriggerId = `${id}-hook`;
  const tagsLabelId = `${id}-tags-label`;

  return (
    <Popover>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      {/* Start-aligned because the wrapped toolbar puts this trigger at the left
          of the content area, where an end-aligned panel expands over the nav. */}
      <PopoverContent
        align="start"
        className="@container flex w-[calc(100vw-2rem)] flex-col gap-4 md:w-[26rem] lg:w-[32rem] xl:w-[40rem]"
        aria-labelledby={filtersTitleId}
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 id={filtersTitleId} className="text-sm font-semibold">
            {intl.formatMessage({ id: "plugins.catalog.filters" })}
          </h2>
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" size="xs" onClick={onClear}>
              {intl.formatMessage({ id: "plugins.catalog.clearFilters" })}
            </Button>
          )}
        </div>

        <div className="shrink-0 space-y-2">
          <Label htmlFor={hookTriggerId} className="text-xs">
            {intl.formatMessage({ id: "plugins.catalog.hook" })}
          </Label>
          <Select
            value={hook || ALL_FILTER_VALUE}
            onValueChange={(value) =>
              onSetSingleFilter("hook", value === ALL_FILTER_VALUE ? null : value)
            }
          >
            <SelectTrigger id={hookTriggerId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>
                {intl.formatMessage({ id: "plugins.catalog.allHooks" })}
              </SelectItem>
              {hooks.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {availableTags.length > 0 && (
          // role=group rather than fieldset: a rendered legend is not subtracted
          // from the height flex assigns its fieldset, so the box overflows it.
          <div
            role="group"
            aria-labelledby={tagsLabelId}
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <span id={tagsLabelId} className="text-xs font-medium">
              {intl.formatMessage({ id: "plugins.catalog.tags" })}
            </span>
            {/* A grid rather than CSS columns: a height-capped multi-column box
                overflows sideways into new columns instead of scrolling down. */}
            <div className="scrollbar-thin grid max-h-140 min-h-0 flex-1 grid-cols-1 gap-x-4 overflow-y-auto rounded-md border p-2 @sm:grid-cols-2 @xl:grid-cols-3">
              {availableTags.map((tag, index) => {
                const checkboxId = `${id}-tag-${index}`;
                return (
                  <div key={tag} className="flex min-w-0 items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={(checked) => onToggleTag(tag, checked === true)}
                    />
                    {/* Full-height label so the tap target clears 44px on touch. */}
                    <Label
                      htmlFor={checkboxId}
                      className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center break-words text-sm font-normal sm:min-h-8"
                    >
                      {tag}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
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

        <PluginFiltersPopover {...filterProps} />
      </div>
    </div>
  );
}
