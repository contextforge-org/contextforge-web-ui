import { useRef } from "react";
import { Code } from "lucide-react";
import { useIntl } from "react-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { JsonHighlighter } from "@/components/ui/json-highlighter";
import type { Tool } from "@/types/tool";

interface ToolSchemaDialogProps {
  tool: Tool | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SchemaSection({
  title,
  schema,
}: {
  title: string;
  schema: Record<string, unknown> | null | undefined;
}) {
  const intl = useIntl();
  const schemaText = schema ? JSON.stringify(schema, null, 2) : "{}";

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="relative">
        <pre className="max-h-[280px] overflow-auto rounded-md border border-neutral-700 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100 whitespace-pre-wrap break-words">
          <code className="break-words">
            <JsonHighlighter text={schemaText} />
          </code>
        </pre>
        <CopyButton
          value={schemaText}
          label={intl.formatMessage({ id: "common.copyValue" }, { label: title.toLowerCase() })}
          className="absolute right-2 top-2 size-6 bg-neutral-800/80 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100"
        />
      </div>
    </div>
  );
}

export function ToolSchemaDialog({ tool, open, onOpenChange }: ToolSchemaDialogProps) {
  const intl = useIntl();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onOpenAutoFocus={(event) => {
          // Radix would otherwise auto-focus the first focusable descendant,
          // a schema copy button buried below the input/output JSON. Close is
          // the more useful place to land in a dialog that's mostly read-only.
          event.preventDefault();
          closeButtonRef.current?.focus();
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded"
              style={{ backgroundColor: "#6FFF9F" }}
            >
              <Code className="h-4 w-4 text-black" />
            </div>
            <DialogTitle>Tool schema</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            View the input and output schemas for this tool
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <SchemaSection
            title={intl.formatMessage({ id: "tools.schemaDialog.input" })}
            schema={tool?.inputSchema}
          />
          <SchemaSection
            title={intl.formatMessage({ id: "tools.schemaDialog.output" })}
            schema={tool?.outputSchema}
          />
        </div>

        <DialogFooter>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
