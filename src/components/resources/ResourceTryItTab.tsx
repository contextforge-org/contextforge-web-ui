import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ResourceRead } from "@/generated/types";

import { RESOURCE_SNIPPETS } from "./buildResourceSnippets";
import { parseUriTemplatePlaceholders, resolveUriTemplate } from "./parseUriTemplate";
import { ResourceArgsForm } from "./ResourceArgsForm";
import { ResourcePreviewButton } from "./ResourcePreviewButton";
import { ResourcePreviewResult } from "./ResourcePreviewResult";
import { useResourcePreview } from "./useResourcePreview";

const DEFAULT_LANGUAGE = "curl";

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
  const selected = useMemo(
    () => resources.find((r) => r.id === selectedResourceId) ?? resources[0] ?? null,
    [resources, selectedResourceId],
  );

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-foreground">
        {intl.formatMessage({ id: "resources.details.resourcePreview" })}
      </h3>

      {resources.length > 1 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={intl.formatMessage({ id: "resources.details.selectResource" })}
        >
          {resources.map((resource) => {
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

  const copiedLabel = intl.formatMessage({ id: "resources.details.code.copySuccess" });
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
                copiedLabel={copiedLabel}
              />
            </TabsContent>
          ))}
        </Tabs>

        <ResourcePreviewResult preview={preview} />
      </div>
    </div>
  );
}
