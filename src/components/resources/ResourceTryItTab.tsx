import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListSearch } from "@/components/ui/list-search";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ResourceRead } from "@/generated/types";

import { RESOURCE_SNIPPETS } from "./buildResourceSnippets";
import { parseUriTemplatePlaceholders, resolveUriTemplate } from "./parseUriTemplate";
import { ResourceArgsForm } from "./ResourceArgsForm";
import { ResourcePreviewButton } from "./ResourcePreviewButton";
import { ResourcePreviewResult } from "./ResourcePreviewResult";
import { useResourcePreview } from "./useResourcePreview";

const DEFAULT_LANGUAGE = "curl";
/** Maximum number of resource chips shown before the picker truncates and relies on search. */
const MAX_VISIBLE_RESOURCE_CHIPS = 10;

export interface ResourceTryItTabProps {
  resources: NonNullable<ResourceRead>[];
  selectedResourceId?: string;
  onSelectResource: (resource: NonNullable<ResourceRead>) => void;
}

/**
 * "Try it" tab content for the resource details drawer: chip picker →
 * (conditional) args form → snippet tabs → Preview, mirroring the Prompts
 * preview pattern. Duplicated into `components/resources/` rather than
 * sharing primitives with `PromptDetailsPanel` up front.
 */
export function ResourceTryItTab({
  resources,
  selectedResourceId,
  onSelectResource,
}: ResourceTryItTabProps) {
  const intl = useIntl();
  const [searchQuery, setSearchQuery] = useState("");
  const selected = useMemo(
    () => resources.find((r) => r.id === selectedResourceId) ?? resources[0] ?? null,
    [resources, selectedResourceId],
  );

  const filteredResources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return resources;
    return resources.filter((resource) =>
      (resource.title || resource.name).toLowerCase().includes(query),
    );
  }, [resources, searchQuery]);

  // Cap the chip picker at MAX_VISIBLE_RESOURCE_CHIPS so a gateway with
  // hundreds of resources doesn't push the preview pane out of view — the
  // currently selected resource is pinned into the visible set even when it
  // would otherwise fall past the cap (e.g. selected from the Definition tab).
  const visibleResources = useMemo(() => {
    const base = filteredResources.slice(0, MAX_VISIBLE_RESOURCE_CHIPS);
    if (selected && !base.some((r) => r.id === selected.id)) {
      const selectedStillMatches = filteredResources.some((r) => r.id === selected.id);
      if (selectedStillMatches) {
        return [...base.slice(0, MAX_VISIBLE_RESOURCE_CHIPS - 1), selected];
      }
    }
    return base;
  }, [filteredResources, selected]);

  const hiddenCount = filteredResources.length - visibleResources.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">
          {intl.formatMessage({ id: "resources.details.resourcePreview" })}
        </h3>
        {resources.length > MAX_VISIBLE_RESOURCE_CHIPS && (
          <ListSearch
            value={searchQuery}
            onChange={setSearchQuery}
            ariaLabel={intl.formatMessage({ id: "resources.details.searchResources.label" })}
            placeholder={intl.formatMessage({
              id: "resources.details.searchResources.placeholder",
            })}
            expandedWidthClassName="w-48"
          />
        )}
      </div>

      {resources.length > 1 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={intl.formatMessage({ id: "resources.details.selectResource" })}
        >
          {visibleResources.map((resource) => {
            const isSelected = resource.id === selected?.id;
            return (
              <Button
                key={resource.id}
                type="button"
                variant={isSelected ? "secondary" : "outline"}
                size="sm"
                aria-pressed={isSelected}
                title={resource.uriTemplate || resource.uri}
                onClick={() => onSelectResource(resource)}
                className={cn(
                  "rounded-full font-mono text-[12px]",
                  isSelected
                    ? "border-transparent bg-muted text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {resource.title || resource.name}
              </Button>
            );
          })}
          {hiddenCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  role="img"
                  aria-label={intl.formatMessage(
                    { id: "resources.details.selectResource.moreCount" },
                    { count: hiddenCount },
                  )}
                  className="inline-flex cursor-default items-center rounded-full border border-transparent bg-muted px-3 py-1.5 font-mono text-[12px] text-muted-foreground"
                >
                  +{hiddenCount}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {intl.formatMessage(
                  { id: "resources.details.selectResource.moreCount" },
                  { count: hiddenCount },
                )}
              </TooltipContent>
            </Tooltip>
          )}
          {filteredResources.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              {intl.formatMessage(
                { id: "resources.details.searchResources.noResults" },
                { query: searchQuery },
              )}
            </p>
          )}
        </div>
      )}

      {selected?.description && (
        <p className="max-w-4xl whitespace-normal break-words text-[13px] leading-4 text-muted-foreground">
          {selected.description}
        </p>
      )}

      {selected && <ResourcePreviewPane key={selected.id} resource={selected} />}
    </div>
  );
}

function seedArgs(placeholders: string[]): Record<string, string> {
  const seed: Record<string, string> = {};
  for (const name of placeholders) seed[name] = "";
  return seed;
}

function ResourcePreviewPane({ resource }: { resource: NonNullable<ResourceRead> }) {
  const intl = useIntl();
  const placeholders = useMemo(
    () => parseUriTemplatePlaceholders(resource.uriTemplate),
    [resource.uriTemplate],
  );
  const [args, setArgs] = useState<Record<string, string>>(() => seedArgs(placeholders));
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  // Every placeholder is required (see ResourceArgsForm) — an unfilled one
  // can't produce a resolvable URI, so block Preview until all are filled.
  const hasUnfilledPlaceholder = placeholders.some((name) => !args[name]?.trim());

  const resolvedUri = useMemo(
    () => (resource.uriTemplate ? resolveUriTemplate(resource.uriTemplate, args) : resource.uri),
    [resource.uriTemplate, resource.uri, args],
  );

  const preview = useResourcePreview(resolvedUri);

  // Switching languages clears the previous run so the Preview affordances
  // match the active snippet — same rule as PromptCodeTab.
  const handleLanguageChange = useCallback(
    (next: string) => {
      preview.reset();
      setLanguage(next);
    },
    [preview],
  );

  const rendered = useMemo(
    () => RESOURCE_SNIPPETS.map((spec) => ({ ...spec, text: spec.build({ uri: resolvedUri }) })),
    [resolvedUri],
  );

  return (
    <div className="space-y-6">
      <ResourceArgsForm args={args} placeholders={placeholders} onChange={setArgs} />

      <div className="space-y-4">
        <Tabs value={language} onValueChange={handleLanguageChange}>
          <div className="mb-2 flex items-center justify-between gap-4">
            <TabsList>
              {RESOURCE_SNIPPETS.map((spec) => (
                <TabsTrigger key={spec.value} value={spec.value}>
                  {intl.formatMessage({ id: spec.labelId })}
                </TabsTrigger>
              ))}
            </TabsList>
            <ResourcePreviewButton preview={preview} disabled={hasUnfilledPlaceholder} />
          </div>

          {rendered.map((snippet) => (
            <TabsContent key={snippet.value} value={snippet.value}>
              <CodeBlock
                code={snippet.text}
                language={snippet.prismLanguage}
                copyLabel={intl.formatMessage(
                  { id: "resources.details.code.copyAriaLabel" },
                  { language: snippet.language },
                )}
              />
            </TabsContent>
          ))}
        </Tabs>

        <ResourcePreviewResult preview={preview} />
      </div>
    </div>
  );
}
