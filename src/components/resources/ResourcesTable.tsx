import { useIntl } from "react-intl";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResourceRead } from "@/generated/types";
import { TruncatedText } from "@/components/ui/truncated-text";
import { TruncatedMiddleText } from "@/components/ui/truncated-middle-text";

export function ResourcesTable({
  resources,
  selectedResourceId,
  onSelectResource,
  onEditResource,
  onDeleteResource,
  onToggleResource,
}: {
  resources: NonNullable<ResourceRead>[];
  selectedResourceId?: string | null;
  onSelectResource: (resource: NonNullable<ResourceRead>) => void;
  onEditResource?: (resource: NonNullable<ResourceRead>) => void;
  onDeleteResource?: (resourceId: string) => void;
  onToggleResource?: (id: string, currentState: boolean) => void;
}) {
  const intl = useIntl();

  return (
    <Table className="min-w-full table-fixed border-separate border-spacing-y-1.5">
      <TableHeader>
        <TableRow className="border-none hover:bg-transparent">
          <TableHead className="h-9 w-[38%] border-b border-border px-4 py-2.5 text-xs font-medium">
            {intl.formatMessage({ id: "resources.table.resource" })}
          </TableHead>
          <TableHead className="h-9 w-[34%] border-b border-border px-4 py-2.5 text-xs font-medium">
            {intl.formatMessage({ id: "resources.table.uri" })}
          </TableHead>
          <TableHead className="h-9 border-b border-border px-4 py-2.5 text-xs font-medium">
            {intl.formatMessage({ id: "resources.table.resourceId" })}
          </TableHead>
          <TableHead className="h-9 w-[40px] border-b border-border px-4 py-2.5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map((resource) => (
          <TableRow
            key={resource.id}
            data-state={selectedResourceId === resource.id ? "selected" : undefined}
            className="border-0 bg-neutral-50 hover:bg-neutral-50 data-[state=selected]:bg-neutral-50 dark:bg-neutral-800/50 dark:hover:bg-neutral-800/50 dark:data-[state=selected]:bg-neutral-800/50 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
          >
            <TableCell className="px-4 py-3 text-sm text-foreground">
              <TruncatedText asChild tooltipContent={resource.title || resource.name}>
                <button
                  type="button"
                  onClick={() => onSelectResource(resource)}
                  className="block max-w-full truncate rounded-sm text-left transition-colors hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {resource.title || resource.name}
                </button>
              </TruncatedText>
            </TableCell>

            <TableCell className="px-4 py-3">
              <div className="group flex min-w-0 items-center">
                <TruncatedMiddleText
                  value={resource.uriTemplate || resource.uri}
                  maxLength={28}
                  className="min-w-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground"
                />
                <CopyButton
                  value={resource.uriTemplate || resource.uri}
                  label={intl.formatMessage(
                    { id: "resources.table.copyUri" },
                    { name: resource.title || resource.name },
                  )}
                  iconClassName="size-3"
                  className="ml-4 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                />
              </div>
            </TableCell>

            <TableCell className="px-4 py-3">
              <div className="group flex min-w-0 items-center">
                <TruncatedMiddleText
                  value={resource.id}
                  maxLength={18}
                  className="min-w-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground"
                />
                <CopyButton
                  value={resource.id}
                  label={intl.formatMessage(
                    { id: "resources.table.copyResourceId" },
                    { name: resource.title || resource.name },
                  )}
                  iconClassName="size-3"
                  className="ml-4 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                />
              </div>
            </TableCell>

            <TableCell className="px-4 py-3 text-center">
              {onEditResource || onDeleteResource ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={intl.formatMessage(
                        { id: "resources.table.moreOptionsFor" },
                        { name: resource.title || resource.name },
                      )}
                      className="size-5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEditResource && (
                      <DropdownMenuItem onClick={() => onEditResource(resource)}>
                        {intl.formatMessage({ id: "resources.table.edit" })}
                      </DropdownMenuItem>
                    )}
                    {onToggleResource && (
                      <DropdownMenuItem
                        onClick={() => onToggleResource(resource.id, resource.enabled ?? true)}
                        aria-label={intl.formatMessage(
                          {
                            id: resource.enabled
                              ? "resources.card.deactivateAriaLabel"
                              : "resources.card.activateAriaLabel",
                          },
                          { name: resource.title || resource.name },
                        )}
                      >
                        {resource.enabled
                          ? intl.formatMessage({ id: "resources.card.deactivate" })
                          : intl.formatMessage({ id: "resources.card.activate" })}
                      </DropdownMenuItem>
                    )}
                    {onDeleteResource && (
                      <DropdownMenuItem onClick={() => onDeleteResource(resource.id)}>
                        {intl.formatMessage({ id: "resources.table.delete" })}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={intl.formatMessage(
                    { id: "resources.table.moreOptionsFor" },
                    { name: resource.title || resource.name },
                  )}
                  className="size-5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
