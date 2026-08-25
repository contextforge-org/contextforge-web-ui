import { useState } from "react";
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
import type { Tool } from "@/types/tool";
import { TruncatedText } from "@/components/ui/truncated-text";
import { TruncatedMiddleText } from "@/components/ui/truncated-middle-text";
import { ToolSchemaDialog } from "@/components/tools/ToolSchemaDialog";

export function ToolsTable({
  tools,
  selectedToolId,
  onSelectTool,
  onDeleteTool,
  onEditTool,
  onToggleTool,
}: {
  tools: Tool[];
  selectedToolId?: string | null;
  onSelectTool: (tool: Tool) => void;
  onDeleteTool?: (toolId: string) => void;
  onEditTool?: (tool: Tool) => void;
  onToggleTool?: (tool: Tool) => void;
}) {
  const intl = useIntl();
  const [schemaDialogTool, setSchemaDialogTool] = useState<Tool | null>(null);
  const [isSchemaDialogOpen, setIsSchemaDialogOpen] = useState(false);

  const handleSchemaClick = (tool: Tool) => {
    setSchemaDialogTool(tool);
    setIsSchemaDialogOpen(true);
  };

  return (
    <>
      <Table className="min-w-full table-fixed border-separate border-spacing-y-1.5">
        <TableHeader>
          <TableRow className="border-none hover:bg-transparent">
            <TableHead className="h-9 w-[30%] border-b border-border px-4 py-2.5 text-xs font-medium">
              {intl.formatMessage({ id: "tools.table.tool" })}
            </TableHead>
            <TableHead className="h-9 w-[30%] border-b border-border px-4 py-2.5 text-xs font-medium">
              {intl.formatMessage({ id: "tools.table.name" })}
            </TableHead>
            <TableHead className="h-9 border-b border-border px-4 py-2.5 text-xs font-medium">
              {intl.formatMessage({ id: "tools.table.toolId" })}
            </TableHead>
            <TableHead className="h-9 w-[80px] border-b border-border px-4 py-2.5 text-xs font-medium">
              {intl.formatMessage({ id: "tools.table.schema" })}
            </TableHead>
            <TableHead className="h-9 w-[40px] border-b border-border px-4 py-2.5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tools.map((tool) => (
            <TableRow
              key={tool.id}
              data-state={selectedToolId === tool.id ? "selected" : undefined}
              className="border-0 bg-neutral-50 hover:bg-neutral-50 data-[state=selected]:bg-neutral-50 dark:bg-neutral-800/50 dark:hover:bg-neutral-800/50 dark:data-[state=selected]:bg-neutral-800/50 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg"
            >
              <TableCell className="px-4 py-3 text-sm text-foreground">
                <TruncatedText asChild tooltipContent={tool.displayName || tool.title || tool.name}>
                  <button
                    type="button"
                    onClick={() => onSelectTool(tool)}
                    className="block max-w-full truncate rounded-sm text-left transition-colors hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {tool.displayName || tool.title || tool.name}
                  </button>
                </TruncatedText>
              </TableCell>

              <TableCell className="px-4 py-3">
                <div className="group flex min-w-0 items-center">
                  <TruncatedText className="min-w-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                    {tool.customName || tool.originalName}
                  </TruncatedText>
                  <CopyButton
                    value={tool.customName || tool.originalName}
                    label={intl.formatMessage(
                      { id: "tools.table.copyName" },
                      { name: tool.customName || tool.originalName },
                    )}
                    iconClassName="size-3"
                    className="ml-4 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                </div>
              </TableCell>

              <TableCell className="px-4 py-3">
                <div className="group flex min-w-0 items-center">
                  <TruncatedMiddleText
                    value={tool.id}
                    maxLength={18}
                    className="min-w-0 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                  <CopyButton
                    value={tool.id}
                    label={intl.formatMessage({ id: "tools.table.copyToolId" })}
                    iconClassName="size-3"
                    className="ml-4 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                </div>
              </TableCell>

              <TableCell className="px-4 py-3 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={intl.formatMessage({ id: "tools.table.viewSchema" })}
                  className="size-5 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => handleSchemaClick(tool)}
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                </Button>
              </TableCell>

              <TableCell className="px-4 py-3 text-center">
                {onEditTool || onToggleTool || onDeleteTool ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={intl.formatMessage({ id: "tools.table.moreOptions" })}
                        className="size-5 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onEditTool && (
                        <DropdownMenuItem onClick={() => onEditTool(tool)}>
                          {intl.formatMessage({ id: "tools.table.edit" })}
                        </DropdownMenuItem>
                      )}
                      {onToggleTool && (
                        <DropdownMenuItem onClick={() => onToggleTool(tool)}>
                          {intl.formatMessage({
                            id: tool.enabled ? "tools.table.deactivate" : "tools.table.activate",
                          })}
                        </DropdownMenuItem>
                      )}
                      {onDeleteTool && (
                        <DropdownMenuItem onClick={() => onDeleteTool(tool.id)}>
                          {intl.formatMessage({ id: "tools.table.delete" })}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="More options"
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

      <ToolSchemaDialog
        tool={schemaDialogTool}
        open={isSchemaDialogOpen}
        onOpenChange={(open) => {
          setIsSchemaDialogOpen(open);
          if (!open) setSchemaDialogTool(null);
        }}
      />
    </>
  );
}
