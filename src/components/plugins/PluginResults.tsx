import { useId, useMemo, memo } from "react";
import type { ReactNode } from "react";
import { Blocks } from "lucide-react";
import { useIntl } from "react-intl";

import { EmptyStatePlaceholder } from "@/components/dashboard/EmptyStatePlaceholder";
import { StatusDot } from "@/components/dashboard/StatusDot";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardTag } from "@/components/ui/card-tag";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PluginSummary } from "@/generated/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const ENABLED_STATUS = "enabled";

enum PluginIconColor {
  Red = "bg-red-500",
  Orange = "bg-orange-500",
  Amber = "bg-amber-500",
  Yellow = "bg-yellow-500",
  Lime = "bg-lime-500",
  Green = "bg-green-500",
  Emerald = "bg-emerald-500",
  Teal = "bg-teal-500",
  Cyan = "bg-cyan-500",
  Sky = "bg-sky-500",
  Blue = "bg-blue-500",
  Indigo = "bg-indigo-500",
  Violet = "bg-violet-500",
  Purple = "bg-purple-500",
  Fuchsia = "bg-fuchsia-500",
  Pink = "bg-pink-500",
}

const PLUGIN_COLORS = Object.values(PluginIconColor);

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function isEnabled(plugin: PluginSummary): boolean {
  return plugin.status === ENABLED_STATUS;
}

const PluginIcon = memo(function PluginIcon({ name }: { name: string }) {
  const colorClass = useMemo(() => {
    const hash = hashString(name);
    return PLUGIN_COLORS[hash % PLUGIN_COLORS.length];
  }, [name]);

  return (
    <div
      aria-hidden="true"
      className={`${colorClass} flex size-8 shrink-0 items-center justify-center rounded-md`}
    >
      <Blocks className="size-4 text-black" />
    </div>
  );
});

function PluginCard({
  plugin,
  onView,
}: {
  plugin: PluginSummary;
  onView: (trigger: HTMLButtonElement) => void;
}) {
  const intl = useIntl();
  const headingId = useId();

  return (
    <li className="min-w-0">
      <Card className="h-full min-h-[200px] gap-0 rounded-xl border border-border bg-card p-0 py-0 shadow-none ring-0 transition-colors hover:border-ring dark:hover:border-muted-foreground">
        <article className="flex h-full flex-col" aria-labelledby={headingId}>
          <CardContent className="flex flex-1 flex-col px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <PluginIcon name={plugin.name} />
              <StatusDot
                tone={isEnabled(plugin) ? "success" : "muted"}
                className="text-sm text-muted-foreground"
              >
                {isEnabled(plugin)
                  ? intl.formatMessage({ id: "plugins.catalog.enabled" })
                  : intl.formatMessage({ id: "plugins.catalog.disabled" })}
              </StatusDot>
            </div>

            <h2 id={headingId} className="mt-4 truncate text-sm font-medium text-foreground">
              {plugin.name}
            </h2>
            <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
              {plugin.description}
            </p>

            <div className="mt-auto pt-4">
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label={intl.formatMessage(
                  { id: "plugins.catalog.viewPlugin" },
                  { name: plugin.name },
                )}
                onClick={(event) => onView(event.currentTarget)}
              >
                {intl.formatMessage({ id: "plugins.catalog.view" })}
              </Button>
            </div>
          </CardContent>
        </article>
      </Card>
    </li>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function PluginDetailsDialog({
  plugin,
  onOpenChange,
}: {
  plugin: PluginSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const intl = useIntl();
  const hooksHeadingId = useId();
  const tagsHeadingId = useId();
  const configHeadingId = useId();
  const configEntries = Object.entries(plugin?.config_summary ?? {});

  return (
    <Dialog open={plugin !== null} onOpenChange={onOpenChange}>
      {plugin && (
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 flex items-center gap-3">
              <PluginIcon name={plugin.name} />
              <DialogTitle>{plugin.name}</DialogTitle>
            </div>
            {plugin.description && <DialogDescription>{plugin.description}</DialogDescription>}
          </DialogHeader>

          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
            {plugin.author && (
              <DetailRow label={intl.formatMessage({ id: "plugins.catalog.author" })}>
                {plugin.author}
              </DetailRow>
            )}
            {plugin.version && (
              <DetailRow label={intl.formatMessage({ id: "plugins.catalog.version" })}>
                {plugin.version}
              </DetailRow>
            )}
            <DetailRow label={intl.formatMessage({ id: "plugins.catalog.mode" })}>
              {plugin.mode}
            </DetailRow>
            <DetailRow label={intl.formatMessage({ id: "plugins.catalog.priority" })}>
              {plugin.priority}
            </DetailRow>
            <DetailRow label={intl.formatMessage({ id: "plugins.catalog.status" })}>
              {isEnabled(plugin)
                ? intl.formatMessage({ id: "plugins.catalog.enabled" })
                : intl.formatMessage({ id: "plugins.catalog.disabled" })}
            </DetailRow>
          </dl>

          {plugin.hooks && plugin.hooks.length > 0 && (
            <section aria-labelledby={hooksHeadingId}>
              <h3 id={hooksHeadingId} className="mb-2 text-sm font-medium text-muted-foreground">
                {intl.formatMessage({ id: "plugins.catalog.hooks" })}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {plugin.hooks.map((hook) => (
                  <li key={hook}>
                    <CardTag variant="neutral">{hook}</CardTag>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plugin.tags && plugin.tags.length > 0 && (
            <section aria-labelledby={tagsHeadingId}>
              <h3 id={tagsHeadingId} className="mb-2 text-sm font-medium text-muted-foreground">
                {intl.formatMessage({ id: "plugins.catalog.tags" })}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {plugin.tags.map((tag) => (
                  <li key={tag}>
                    <CardTag variant="neutral">{tag}</CardTag>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {configEntries.length > 0 && (
            <section aria-labelledby={configHeadingId}>
              <h3 id={configHeadingId} className="mb-2 text-sm font-medium text-muted-foreground">
                {intl.formatMessage({ id: "plugins.catalog.configuration" })}
              </h3>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
                {configEntries.map(([key, value]) => (
                  <DetailRow key={key} label={key}>
                    {formatConfigValue(value)}
                  </DetailRow>
                ))}
              </dl>
            </section>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

export function PluginResults({
  plugins,
  emptyStateMessageId,
  onView,
}: {
  plugins: PluginSummary[];
  emptyStateMessageId: string;
  onView: (plugin: PluginSummary, trigger: HTMLButtonElement) => void;
}) {
  const intl = useIntl();
  const announcedCount = useDebouncedValue(plugins.length, 300);

  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {intl.formatMessage({ id: "plugins.catalog.resultCount" }, { count: announcedCount })}
      </p>
      {plugins.length > 0 ? (
        <ul
          aria-label={intl.formatMessage({ id: "plugins.catalog.resultsLabel" })}
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-6"
        >
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.name}
              plugin={plugin}
              onView={(trigger) => onView(plugin, trigger)}
            />
          ))}
        </ul>
      ) : (
        <EmptyStatePlaceholder messageId={emptyStateMessageId} />
      )}
    </>
  );
}
