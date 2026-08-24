import { MoreHorizontal } from "lucide-react";
import { useIntl } from "react-intl";

import type { PromptRead } from "@/generated/types";
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
import { TruncatedText } from "@/components/ui/truncated-text";
import { TruncatedMiddleText } from "@/components/ui/truncated-middle-text";

export interface PromptDefinitionTableProps {
  prompts: NonNullable<PromptRead>[];
  selectedPromptId?: string;
  onSelectPrompt: (prompt: NonNullable<PromptRead>) => void;
  onEdit?: (prompt: NonNullable<PromptRead>) => void;
  onDelete?: (prompt: NonNullable<PromptRead>) => void;
  onTogglePrompt?: (id: string, currentState: boolean) => void;
}

/**
 * "Definition" tab content for the prompt details drawer. Styled to match the
 * Tools/Resources tables: lists every prompt in the group with its name and a
 * copyable ID, plus a per-row overflow menu (Edit/Delete). Selecting a row
 * updates the Prompt details sidebar. The overflow menu replaces the one that
 * previously sat beside the panel title.
 */
export function PromptDefinitionTable({
  prompts,
  selectedPromptId,
  onSelectPrompt,
  onEdit,
  onDelete,
  onTogglePrompt,
}: PromptDefinitionTableProps) {
  const intl = useIntl();

  return (
    <Table className="min-w-full table-fixed border-separate border-spacing-y-1.5">
      <TableHeader>
        <TableRow className="border-none hover:bg-transparent">
          <TableHead className="h-9 w-[30%] border-b border-border px-4 py-2.5 text-xs font-medium">
            {intl.formatMessage({ id: "prompts.details.label.name" })}
          </TableHead>
          <TableHead className="h-9 border-b border-border px-4 py-2.5 text-xs font-medium">
            {intl.formatMessage({ id: "prompts.details.label.promptId" })}
          </TableHead>
          <TableHead className="h-9 w-[40px] border-b border-border px-4 py-2.5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {prompts.map((prompt) => (
          <TableRow
            key={prompt.id}
            data-state={selectedPromptId === prompt.id ? "selected" : undefined}
            className="border-0 bg-neutral-50 hover:bg-neutral-50 data-[state=selected]:bg-neutral-50 dark:bg-neutral-800/50 dark:hover:bg-neutral-800/50 dark:data-[state=selected]:bg-neutral-800/50 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
          >
            <TableCell className="px-4 py-3 text-sm text-foreground">
              <TruncatedText asChild tooltipContent={prompt.displayName || prompt.name}>
                <button
                  type="button"
                  onClick={() => onSelectPrompt(prompt)}
                  className="block max-w-full truncate rounded-sm text-left transition-colors hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {prompt.displayName || prompt.name}
                </button>
              </TruncatedText>
            </TableCell>

            <TableCell className="px-4 py-3">
              <div className="group flex min-w-0 items-center">
                <TruncatedMiddleText
                  value={prompt.id}
                  maxLength={40}
                  className="min-w-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground"
                />
                <CopyButton
                  value={prompt.id}
                  label={intl.formatMessage(
                    { id: "prompts.details.table.copyPromptId" },
                    { name: prompt.name },
                  )}
                  iconClassName="size-3"
                  className="ml-4 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                />
              </div>
            </TableCell>

            <TableCell className="px-4 py-3 text-center">
              {(onEdit || onDelete || onTogglePrompt) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={intl.formatMessage(
                        { id: "prompts.details.moreOptionsFor" },
                        { name: prompt.name },
                      )}
                      className="size-5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(prompt)}>
                        {intl.formatMessage({ id: "prompts.details.action.edit" })}
                      </DropdownMenuItem>
                    )}
                    {onTogglePrompt &&
                      (() => {
                        const enabled = prompt.enabled ?? true;
                        return (
                          <DropdownMenuItem
                            onClick={() => onTogglePrompt(prompt.id, enabled)}
                            aria-label={intl.formatMessage(
                              {
                                id: enabled
                                  ? "prompts.details.deactivateAriaLabel"
                                  : "prompts.details.activateAriaLabel",
                              },
                              { name: prompt.displayName || prompt.name },
                            )}
                          >
                            {enabled
                              ? intl.formatMessage({ id: "prompts.details.action.deactivate" })
                              : intl.formatMessage({ id: "prompts.details.action.activate" })}
                          </DropdownMenuItem>
                        );
                      })()}
                    {onDelete && (
                      <DropdownMenuItem onClick={() => onDelete(prompt)}>
                        {intl.formatMessage({ id: "prompts.details.action.delete" })}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
