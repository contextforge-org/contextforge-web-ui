import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useIntl } from "react-intl";
import { Activity, FileText, PanelRightClose } from "lucide-react";
import {
  VisibilityInfoPopover,
  getVisibilityIcon,
} from "@/components/common/VisibilityInfoPopover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import { InlineTagAdd } from "@/components/ui/inline-tag-add";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ResourceRead } from "@/generated/types";
import { formatBytes, formatDateTime } from "@/utils/format";
import { getTagLabels } from "@/utils/tags";
import { ResourceDefinitionTab } from "@/components/resources/ResourceDefinitionTab";
import { ResourceTryItTab } from "@/components/resources/ResourceTryItTab";

// Segmented-control styling for the Try it / Definition tab triggers.
const SEGMENTED_TRIGGER_CLASS =
  "flex-1 rounded-sm px-3 py-1.5 font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-[96px_minmax(0,1fr)] items-start gap-4 ${className ?? ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

interface ResourceDetailsPanelProps {
  resources: NonNullable<ResourceRead>[];
  gatewaySlug: string;
  /** Tab to select each time the panel opens. Defaults to "tryIt". */
  initialTab?: "tryIt" | "definition";
  open: boolean;
  onClose: () => void;
  onEditResource?: (resource: NonNullable<ResourceRead>) => void;
  onDeleteResource?: (resourceId: string) => void;
  onToggleResource?: (id: string, currentState: boolean) => void;
  /**
   * Persists the resource's full tag list after an inline add. Receives the
   * resource ID and the new complete list of tag labels. When omitted, the tag
   * row shows a non-interactive "add" affordance.
   */
  onAddTag?: (resourceId: string, tags: string[]) => Promise<void>;
}

export function ResourceDetailsPanel({
  resources,
  gatewaySlug,
  initialTab = "tryIt",
  open,
  onClose,
  onEditResource,
  onDeleteResource,
  onToggleResource,
  onAddTag,
}: ResourceDetailsPanelProps) {
  const intl = useIntl();
  // Shared across the "Try it" chip picker, the "Definition" table, and the
  // details sidebar — selecting a resource in either tab updates the same
  // sidebar, matching PromptDetailsPanel's single `selectedId`.
  const [selectedResourceId, setSelectedResourceId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const headingId = useMemo(() => `resource-details-heading-${gatewaySlug}`, [gatewaySlug]);

  // Manage selected resource state: select first on open, reset on close, and
  // re-sync when resources list refreshes to keep details column up-to-date.
  useEffect(() => {
    if (!open) {
      setSelectedResourceId(undefined);
      return;
    }

    // Select first resource when panel opens if none selected
    if (resources.length > 0 && !selectedResourceId) {
      setSelectedResourceId(resources[0].id);
      return;
    }

    // Re-sync the selected resource when the resources list refreshes
    if (selectedResourceId && !resources.some((r) => r.id === selectedResourceId)) {
      setSelectedResourceId(resources[0]?.id);
    }
  }, [open, resources, selectedResourceId]);

  // Land on `initialTab` (default "Try it") each time the panel opens,
  // regardless of which tab was active when it was last closed — mirrors
  // PromptDetailsPanel.
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  const selectedResource = useMemo(
    () => resources.find((r) => r.id === selectedResourceId) ?? null,
    [resources, selectedResourceId],
  );

  // Focus close on open; restore focus on close/unmount.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    closeButtonRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, [open]);

  // ESC closes while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const getVisibilityLabel = useCallback(
    (value?: string | null) => {
      if (value === "team") return intl.formatMessage({ id: "common.visibility.team" });
      if (value === "public") return intl.formatMessage({ id: "common.visibility.internal" });
      if (value === "private") return intl.formatMessage({ id: "common.visibility.private" });
      return intl.formatMessage({ id: "resources.details.notAvailable" });
    },
    [intl],
  );
  const VisibilityIcon = getVisibilityIcon(selectedResource?.visibility);

  return (
    <>
      <div
        data-state={open ? "open" : "closed"}
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 z-10 bg-black/50 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs",
          "data-[state=open]:opacity-100 data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none",
        )}
      />

      <aside
        role="region"
        aria-labelledby={headingId}
        aria-hidden={!open}
        inert={!open}
        data-state={open ? "open" : "closed"}
        className={cn(
          "absolute inset-y-0 right-0 z-20 flex w-[min(1236px,calc(100%-2rem))] border-l border-border bg-popover text-[13px] shadow-lg",
          "transition-transform duration-200 ease-out",
          "data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full",
          "data-[state=closed]:pointer-events-none",
        )}
      >
        {resources.length > 0 && (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 overflow-y-auto px-6 py-8 lg:px-12">
              <h2 id={headingId} className="sr-only">
                {intl.formatMessage(
                  { id: "resources.details.resourcesFor" },
                  { name: gatewaySlug },
                )}
              </h2>

              {/* Header with icon and title */}
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-tool-icon-bg">
                  <FileText className="h-3.5 w-3.5 text-black" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-foreground">{gatewaySlug}</h3>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="inline-flex h-10 w-[248px] items-center gap-0 rounded-md bg-muted p-1">
                  <TabsTrigger value="tryIt" className={SEGMENTED_TRIGGER_CLASS}>
                    {intl.formatMessage({ id: "resources.details.tab.tryIt" })}
                  </TabsTrigger>
                  <TabsTrigger value="definition" className={SEGMENTED_TRIGGER_CLASS}>
                    {intl.formatMessage({ id: "resources.details.tab.definition" })}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tryIt" className="mt-8">
                  <ResourceTryItTab
                    resources={resources}
                    selectedResourceId={selectedResource?.id}
                    onSelectResource={(r) => setSelectedResourceId(r.id)}
                  />
                </TabsContent>

                <TabsContent value="definition" className="mt-8">
                  <ResourceDefinitionTab
                    resources={resources}
                    selectedResourceId={selectedResource?.id}
                    onSelectResource={(r) => setSelectedResourceId(r.id)}
                    onEditResource={onEditResource}
                    onDeleteResource={onDeleteResource}
                    onToggleResource={onToggleResource}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <aside className="relative border-t border-border lg:border-l lg:border-t-0">
              <Button
                ref={closeButtonRef}
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={intl.formatMessage({ id: "resources.details.close" })}
                className="absolute right-3 top-3 text-muted-foreground"
                onClick={onClose}
              >
                <PanelRightClose className="size-4" />
              </Button>

              {selectedResource && (
                <>
                  <div className="border-b border-border p-4 pt-8">
                    <h3 className="mb-7 text-sm font-semibold text-foreground">
                      {intl.formatMessage({ id: "resources.details.componentDetails" })}
                    </h3>

                    <dl className="space-y-4">
                      <DetailRow
                        label={intl.formatMessage({ id: "resources.details.label.status" })}
                      >
                        <span className="flex items-center gap-2">
                          <Activity
                            className={`size-3.5 ${
                              selectedResource.enabled
                                ? "text-tool-status-active"
                                : "text-tool-status-inactive"
                            }`}
                          />
                          {selectedResource.enabled
                            ? intl.formatMessage({ id: "resources.details.status.active" })
                            : intl.formatMessage({ id: "resources.details.status.inactive" })}
                        </span>
                      </DetailRow>
                      <DetailRow
                        label={intl.formatMessage({ id: "resources.details.label.visibility" })}
                      >
                        <span className="flex items-center gap-2">
                          <VisibilityIcon className="size-3.5 text-muted-foreground" />
                          {getVisibilityLabel(selectedResource.visibility)}
                          <VisibilityInfoPopover
                            side="left"
                            visibility={selectedResource.visibility}
                          />
                        </span>
                      </DetailRow>
                      {selectedResource.mimeType && (
                        <DetailRow
                          label={intl.formatMessage({ id: "resources.details.label.type" })}
                        >
                          <span className="text-foreground">{selectedResource.mimeType}</span>
                        </DetailRow>
                      )}
                      <DetailRow label={intl.formatMessage({ id: "resources.details.label.uri" })}>
                        <CopyValue
                          label={intl.formatMessage({ id: "resources.details.label.uri" })}
                          value={selectedResource.uriTemplate || selectedResource.uri}
                        />
                      </DetailRow>
                      {selectedResource.size != null && (
                        <DetailRow
                          label={intl.formatMessage({ id: "resources.details.label.size" })}
                        >
                          <span className="text-foreground">
                            {formatBytes(selectedResource.size)}
                          </span>
                        </DetailRow>
                      )}
                      {(() => {
                        const tagLabels = getTagLabels(selectedResource.tags || []);
                        return (
                          <InlineTagAdd
                            label={intl.formatMessage({ id: "resources.details.label.tags" })}
                            existingTags={tagLabels}
                            onAdd={
                              onAddTag
                                ? (newTags) =>
                                    onAddTag(String(selectedResource.id), [
                                      ...tagLabels,
                                      ...newTags,
                                    ])
                                : undefined
                            }
                          >
                            {tagLabels.map((tag, index) => (
                              <Badge
                                key={`${tag}-${index}`}
                                variant="outline"
                                className="rounded-full px-2 py-0 text-[11px] font-medium text-muted-foreground"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </InlineTagAdd>
                        );
                      })()}
                    </dl>
                  </div>

                  <div className="p-4">
                    <h3 className="mb-7 text-sm font-semibold text-foreground">
                      {intl.formatMessage({ id: "resources.details.activity" })}
                    </h3>
                    <dl className="space-y-4">
                      <DetailRow
                        label={intl.formatMessage({ id: "resources.details.label.created" })}
                      >
                        {formatDateTime(
                          selectedResource.createdAt,
                          intl.formatMessage({ id: "resources.details.notAvailable" }),
                        )}
                      </DetailRow>
                      <DetailRow
                        label={intl.formatMessage({ id: "resources.details.label.lastModified" })}
                      >
                        {formatDateTime(
                          selectedResource.updatedAt,
                          intl.formatMessage({ id: "resources.details.notAvailable" }),
                        )}
                      </DetailRow>
                    </dl>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
      </aside>
    </>
  );
}
