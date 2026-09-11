import { useState } from "react";
import { useIntl } from "react-intl";
import { Download, ExternalLink } from "lucide-react";

import { CodeBlock, type CodeBlockLanguage } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_ICON } from "@/lib/status";
import { formatBytes } from "@/utils/format";
import type { ResourceTestContent } from "@/api/resources";
import type { ResourcePreviewState } from "./useResourcePreview";

export interface ResourcePreviewResultProps {
  preview: Pick<ResourcePreviewState, "result" | "error" | "hasRun">;
}

// Results over ~256 KB collapse behind a "View all" affordance instead of
// pasting the full blob into the DOM immediately.
const SIZE_GUARD_BYTES = 256 * 1024;

type RenderKind = "code" | "image" | "pdf" | "binary";

function normalizeMimeType(content: ResourceTestContent, fallbackMimeType?: string | null): string {
  const raw = content.mimeType ?? content.mime_type ?? fallbackMimeType ?? "";
  return raw.split(";")[0].trim().toLowerCase();
}

function classify(mimeType: string): RenderKind {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    return "code";
  }
  return "binary";
}

function codeLanguageFor(mimeType: string): CodeBlockLanguage {
  if (mimeType === "application/json") return "json";
  if (mimeType === "application/xml" || mimeType === "text/xml") return "xml";
  // Markdown stays raw (unrendered) in v1 — shown as plain text, not
  // formatted markdown.
  if (mimeType === "text/markdown") return "markdown";
  return "text";
}

/** Byte length of base64-decoded content, without materializing the bytes. */
function base64ByteLength(base64: string): number {
  const trimmed = base64.replace(/=+$/, "");
  return Math.floor((trimmed.length * 3) / 4);
}

function computeSize(content: ResourceTestContent): number {
  if (typeof content.size === "number") return content.size;
  if (typeof content.text === "string") return new Blob([content.text]).size;
  if (typeof content.blob === "string") return base64ByteLength(content.blob);
  return 0;
}

/**
 * Status row + rendered-content block. Renders nothing before the first
 * Preview run; mirrors `PromptPreviewResult` with a MIME switch in
 * place of the `messages[]` render.
 */
export function ResourcePreviewResult({ preview }: ResourcePreviewResultProps) {
  const intl = useIntl();
  const { result, error, hasRun } = preview;
  const [expanded, setExpanded] = useState(false);

  if (!hasRun) return null;

  const renderTimeMs = result?.renderTimeMs ?? error?.renderTimeMs ?? 0;
  const succeeded = result !== null;
  const statusCode = result?.status ?? error?.status ?? null;
  const statusLabel = succeeded
    ? intl.formatMessage(
        { id: "resources.details.preview.statusOk" },
        { status: statusCode ?? 200 },
      )
    : statusCode !== null
      ? intl.formatMessage(
          { id: "resources.details.preview.statusErrorWithCode" },
          { status: statusCode },
        )
      : intl.formatMessage({ id: "resources.details.preview.statusError" });

  return (
    <div className="space-y-3">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"
      >
        {succeeded ? (
          <STATUS_ICON.success className="size-4 text-success" />
        ) : (
          <STATUS_ICON.error className="size-4 text-destructive" />
        )}
        <span className={cn("font-medium", succeeded ? "text-foreground" : "text-destructive")}>
          {statusLabel}
        </span>
        <span className="text-muted-foreground" aria-hidden="true">
          ·
        </span>
        <span className="text-muted-foreground">
          {intl.formatMessage({ id: "resources.details.preview.renderMs" }, { ms: renderTimeMs })}
        </span>
      </div>

      {result && (
        <ResourceContentPreview
          content={result.content}
          expanded={expanded}
          onExpand={() => setExpanded(true)}
        />
      )}

      {error && (
        <pre className="overflow-auto rounded-md border border-destructive/40 bg-destructive/5 p-4 font-mono text-[12px] leading-relaxed text-destructive">
          {error.message}
        </pre>
      )}
    </div>
  );
}

function ResourceContentPreview({
  content,
  expanded,
  onExpand,
}: {
  content: ResourceTestContent;
  expanded: boolean;
  onExpand: () => void;
}) {
  const intl = useIntl();
  const mimeType = normalizeMimeType(content);
  const kind = classify(mimeType);
  const size = computeSize(content);
  const sizeLabel = formatBytes(size);
  const oversized = size > SIZE_GUARD_BYTES;

  if (oversized && !expanded && kind !== "pdf" && kind !== "binary") {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-4">
        <span className="text-[13px] text-muted-foreground">
          {intl.formatMessage(
            { id: "resources.details.preview.collapsed" },
            { mimeType: mimeType || "?", size: sizeLabel },
          )}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onExpand}>
          {intl.formatMessage({ id: "resources.details.preview.viewAll" })}
        </Button>
      </div>
    );
  }

  if (kind === "code") {
    return (
      <CodeBlock
        code={content.text ?? ""}
        language={codeLanguageFor(mimeType)}
        copyLabel={intl.formatMessage(
          { id: "common.copyValue" },
          {
            label:
              mimeType || intl.formatMessage({ id: "resources.details.preview.contentFallback" }),
          },
        )}
      />
    );
  }

  if (kind === "image" && content.blob) {
    const dataUrl = `data:${mimeType};base64,${content.blob}`;
    return (
      <figure className="space-y-2">
        <img
          src={dataUrl}
          alt={intl.formatMessage(
            { id: "resources.details.preview.imageAlt" },
            { mimeType, size: sizeLabel },
          )}
          className="max-h-[420px] max-w-full rounded-md border border-border object-contain"
        />
        <figcaption className="text-[12px] text-muted-foreground">
          {mimeType} · {sizeLabel}
        </figcaption>
      </figure>
    );
  }

  if (kind === "pdf" && content.blob) {
    const dataUrl = `data:${mimeType};base64,${content.blob}`;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
        <span className="text-[13px] text-muted-foreground">
          {mimeType} · {sizeLabel}
        </span>
        <Button asChild type="button" variant="outline" size="sm">
          <a href={dataUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            {intl.formatMessage({ id: "resources.details.preview.openInNewTab" })}
          </a>
        </Button>
        <Button asChild type="button" variant="outline" size="sm">
          <a href={dataUrl} download>
            <Download className="size-3.5" />
            {intl.formatMessage({ id: "resources.details.preview.downloadRaw" })}
          </a>
        </Button>
      </div>
    );
  }

  // Unknown / octet-stream / any MIME we couldn't otherwise render — never
  // render as text.
  const dataUrl = content.blob
    ? `data:${mimeType || "application/octet-stream"};base64,${content.blob}`
    : null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
      <span className="text-[13px] text-muted-foreground">
        {(mimeType || "application/octet-stream") + " · " + sizeLabel}
      </span>
      {dataUrl && (
        <Button asChild type="button" variant="outline" size="sm">
          <a href={dataUrl} download>
            <Download className="size-3.5" />
            {intl.formatMessage({ id: "resources.details.preview.downloadRaw" })}
          </a>
        </Button>
      )}
    </div>
  );
}
