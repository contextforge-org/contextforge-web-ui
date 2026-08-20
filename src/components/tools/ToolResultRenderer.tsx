import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { useIntl } from "react-intl";

import type { ToolPreviewResponse } from "@/api/tools";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  codeLanguageForMime,
  formatTextForMime,
  formatToolResultBytes,
  getDataUrl,
  getToolResultContentBlocks,
  getToolResultIsError,
  getToolStructuredOutput,
  isTextualMime,
  type NormalizedToolContentBlock,
} from "./toolResultContent";

export interface ToolResultRendererProps {
  response: ToolPreviewResponse;
}

export function ToolResultRenderer({ response }: ToolResultRendererProps) {
  const intl = useIntl();
  const blocks = getToolResultContentBlocks(response);
  const structuredOutput = getToolStructuredOutput(response);
  const hasStructuredOutput = structuredOutput !== undefined;
  const isError = getToolResultIsError(response);

  if (blocks.length === 0 && !hasStructuredOutput) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">
          {intl.formatMessage({ id: "tools.details.preview.result.title" })}
        </h4>
        {isError && (
          <Badge variant="destructive" className="rounded-full px-2 py-0 text-[11px]">
            {intl.formatMessage({ id: "tools.details.preview.result.errorBadge" })}
          </Badge>
        )}
      </div>

      {blocks.map((block, index) => (
        <ToolResultBlock
          key={`${block.type}-${block.mimeType}-${index}`}
          block={block}
          index={index}
        />
      ))}

      {hasStructuredOutput && (
        <Accordion
          type="single"
          collapsible
          defaultValue="structured-output"
          className="rounded-md border border-border"
        >
          <AccordionItem value="structured-output" className="border-b-0 px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              {intl.formatMessage({ id: "tools.details.preview.result.structuredOutput" })}
            </AccordionTrigger>
            <AccordionContent>
              <CodeBlock
                code={stringifyJson(structuredOutput)}
                language="json"
                copyLabel={intl.formatMessage({
                  id: "tools.details.preview.result.copyStructuredOutput",
                })}
                copiedLabel={intl.formatMessage({ id: "tools.details.preview.copied" })}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </section>
  );
}

function ToolResultBlock({ block, index }: { block: NormalizedToolContentBlock; index: number }) {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(!block.isLarge);
  const blockNumber = index + 1;
  const sizeLabel = formatToolResultBytes(block.byteSize);

  return (
    <article
      aria-label={intl.formatMessage(
        { id: "tools.details.preview.result.blockAriaLabel" },
        { number: blockNumber },
      )}
      className="space-y-3 rounded-md border border-border bg-muted/20 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h5 className="text-[13px] font-semibold text-foreground">
            {intl.formatMessage(
              { id: "tools.details.preview.result.blockTitle" },
              { number: blockNumber },
            )}
          </h5>
          <Badge variant="outline" className="rounded-full px-2 py-0 text-[11px]">
            {block.type}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <span>{block.mimeType}</span>
          <span aria-hidden="true">-</span>
          <span>{sizeLabel}</span>
        </div>
      </div>

      {block.isLarge && !expanded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-[13px]">
          <span className="text-muted-foreground">
            {intl.formatMessage(
              { id: "tools.details.preview.result.largeContent" },
              { size: sizeLabel },
            )}
          </span>
          <Button type="button" variant="outline" size="xs" onClick={() => setExpanded(true)}>
            {intl.formatMessage({ id: "tools.details.preview.result.viewAll" })}
          </Button>
        </div>
      ) : (
        <RenderedBlock block={block} index={index} />
      )}
    </article>
  );
}

function RenderedBlock({ block, index }: { block: NormalizedToolContentBlock; index: number }) {
  const intl = useIntl();
  const downloadHref = getDataUrl(block);

  if (block.text !== undefined && isTextualMime(block.mimeType)) {
    return (
      <CodeBlock
        code={formatTextForMime(block.text, block.mimeType)}
        language={codeLanguageForMime(block.mimeType)}
        copyLabel={intl.formatMessage({ id: "tools.details.preview.result.copyBlock" })}
        copiedLabel={intl.formatMessage({ id: "tools.details.preview.copied" })}
      />
    );
  }

  if (block.mimeType.toLowerCase().startsWith("image/") && downloadHref) {
    return (
      <figure className="space-y-2">
        <img
          src={downloadHref}
          alt={intl.formatMessage(
            { id: "tools.details.preview.result.imageAlt" },
            { number: index + 1 },
          )}
          className="max-h-80 max-w-full rounded-md border border-border bg-background object-contain"
        />
        <figcaption className="text-[12px] text-muted-foreground">
          {block.mimeType} - {formatToolResultBytes(block.byteSize)}
        </figcaption>
      </figure>
    );
  }

  if (block.mimeType.toLowerCase() === "application/pdf" && downloadHref) {
    return (
      <BinaryActions
        href={downloadHref}
        downloadName={`tool-result-${index + 1}.pdf`}
        openLabel={intl.formatMessage({ id: "tools.details.preview.result.openInNewTab" })}
        downloadLabel={intl.formatMessage({ id: "tools.details.preview.result.downloadRaw" })}
      />
    );
  }

  if (downloadHref) {
    return (
      <BinaryActions
        href={downloadHref}
        downloadName={`tool-result-${index + 1}`}
        downloadLabel={intl.formatMessage({ id: "tools.details.preview.result.downloadRaw" })}
      />
    );
  }

  if (block.uri) {
    return (
      <div className="rounded-md border border-border bg-background p-3 text-[13px]">
        <div className="text-muted-foreground">
          {intl.formatMessage({ id: "tools.details.preview.result.resourceUri" })}
        </div>
        <div className="mt-1 break-all font-mono text-[12px] text-foreground">{block.uri}</div>
      </div>
    );
  }

  return (
    <CodeBlock
      code={stringifyJson(block.raw)}
      language="json"
      copyLabel={intl.formatMessage({ id: "tools.details.preview.result.copyBlock" })}
      copiedLabel={intl.formatMessage({ id: "tools.details.preview.copied" })}
    />
  );
}

function BinaryActions({
  href,
  downloadName,
  openLabel,
  downloadLabel,
}: {
  href: string;
  downloadName: string;
  openLabel?: string;
  downloadLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-3">
      {openLabel && (
        <Button asChild variant="outline" size="sm">
          <a href={href} target="_blank" rel="noreferrer">
            <ExternalLink className="size-4" />
            {openLabel}
          </a>
        </Button>
      )}
      <Button asChild variant="outline" size="sm">
        <a href={href} download={downloadName}>
          <Download className="size-4" />
          {downloadLabel}
        </a>
      </Button>
    </div>
  );
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined";
  } catch {
    return String(value);
  }
}
