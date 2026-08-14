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
      <PopoverContent align="end" className="w-80 space-y-4" aria-labelledby={filtersTitleId}>
        <div className="flex items-center justify-between">
          <h2 id={filtersTitleId} className="text-sm font-semibold">
            {intl.formatMessage({ id: "plugins.catalog.filters" })}
          </h2>
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" size="xs" onClick={onClear}>
              {intl.formatMessage({ id: "plugins.catalog.clearFilters" })}
            </Button>
          )}
        </div>

        <div className="space-y-2">
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
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium">
              {intl.formatMessage({ id: "plugins.catalog.tags" })}
            </legend>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
              {availableTags.map((tag, index) => {
                const checkboxId = `${id}-tag-${index}`;
                return (
                  <div key={tag} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={(checked) => onToggleTag(tag, checked === true)}
                    />
                    <Label htmlFor={checkboxId} className="cursor-pointer text-sm font-normal">
                      {tag}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>
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
