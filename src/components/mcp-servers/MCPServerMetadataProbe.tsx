import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { useIntl } from "react-intl";
import { serversApi } from "@/api/servers";
import { ConfirmDialog } from "@/components/servers/ConfirmDialog";
import { Button } from "@/components/ui/button";
import type { GatewayHandshakeResponse } from "@/generated/types";
import { parseApiError } from "@/lib/errorUtils";
import { sanitizeString } from "@/lib/sanitize";

type ProbeStatus = "idle" | "testing" | "success" | "error";

interface DetectedMetadata {
  name?: string;
  description?: string;
}

interface MCPServerMetadataProbeProps {
  serverUrl: string;
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

function extractInstructions(result: NonNullable<GatewayHandshakeResponse>): string | undefined {
  const structured = (result as NonNullable<GatewayHandshakeResponse> & { instructions?: unknown })
    .instructions;
  if (typeof structured === "string") return structured;

  if (!result.rawPreview) return undefined;
  try {
    const preview = JSON.parse(result.rawPreview) as { instructions?: unknown };
    return typeof preview.instructions === "string" ? preview.instructions : undefined;
  } catch {
    return undefined;
  }
}

function isTestableUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function MCPServerMetadataProbe({
  serverUrl,
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: MCPServerMetadataProbeProps) {
  const intl = useIntl();
  const [status, setStatus] = useState<ProbeStatus>("idle");
  const [message, setMessage] = useState("");
  const [pendingOverwrite, setPendingOverwrite] = useState<DetectedMetadata | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleProbe = useCallback(async () => {
    const normalizedUrl = serverUrl.trim();
    if (!isTestableUrl(normalizedUrl)) {
      setStatus("error");
      setMessage(intl.formatMessage({ id: "mcpServer.form.metadataProbe.invalidUrl" }));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("testing");
    setMessage("");
    setPendingOverwrite(null);

    try {
      const result = await serversApi.testHandshake({ baseUrl: normalizedUrl }, controller.signal);
      if (controller.signal.aborted) return;
      if (!result?.success) {
        setStatus("error");
        setMessage(
          result?.error || intl.formatMessage({ id: "mcpServer.form.metadataProbe.failed" }),
        );
        return;
      }

      // React renders these values as text. Sanitization additionally strips
      // controls and caps remote input before it reaches form state.
      const instructions = extractInstructions(result);
      const detected: DetectedMetadata = {
        name: result.serverName ? sanitizeString(result.serverName, 100) : undefined,
        description: instructions ? sanitizeString(instructions, 200) : undefined,
      };

      const conflicts: DetectedMetadata = {};
      if (detected.name) {
        if (!name.trim()) onNameChange(detected.name);
        else if (name.trim() !== detected.name) conflicts.name = detected.name;
      }
      if (detected.description) {
        if (!description.trim()) onDescriptionChange(detected.description);
        else if (description.trim() !== detected.description)
          conflicts.description = detected.description;
      }

      const hasMetadata = Boolean(detected.name || detected.description);
      const hasConflicts = Boolean(conflicts.name || conflicts.description);
      setStatus("success");
      setMessage(
        intl.formatMessage({
          id: hasMetadata
            ? "mcpServer.form.metadataProbe.success"
            : "mcpServer.form.metadataProbe.successNoMetadata",
        }),
      );
      if (hasConflicts) setPendingOverwrite(conflicts);
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setMessage(
        parseApiError(error, intl.formatMessage({ id: "mcpServer.form.metadataProbe.failed" })),
      );
    }
  }, [description, intl, name, onDescriptionChange, onNameChange, serverUrl]);

  const handleOverwrite = useCallback(() => {
    if (pendingOverwrite?.name) onNameChange(pendingOverwrite.name);
    if (pendingOverwrite?.description) onDescriptionChange(pendingOverwrite.description);
    setPendingOverwrite(null);
  }, [onDescriptionChange, onNameChange, pendingOverwrite]);

  const isTesting = status === "testing";

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {intl.formatMessage({ id: "mcpServer.form.metadataProbe.title" })}
          </p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {intl.formatMessage({ id: "mcpServer.form.metadataProbe.help" })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleProbe()}
          disabled={isTesting || !serverUrl.trim()}
        >
          {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {intl.formatMessage({
            id: isTesting
              ? "mcpServer.form.metadataProbe.testing"
              : "mcpServer.form.metadataProbe.action",
          })}
        </Button>
      </div>

      {status !== "idle" && status !== "testing" && message && (
        <div
          role={status === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 text-xs ${
            status === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {status === "error" ? (
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{message}</span>
        </div>
      )}

      <ConfirmDialog
        open={pendingOverwrite !== null}
        onOpenChange={(open) => {
          if (!open) setPendingOverwrite(null);
        }}
        title={intl.formatMessage({ id: "mcpServer.form.metadataProbe.confirmTitle" })}
        description={intl.formatMessage({
          id: "mcpServer.form.metadataProbe.confirmDescription",
        })}
        confirmLabel={intl.formatMessage({ id: "mcpServer.form.metadataProbe.confirmAction" })}
        onConfirm={handleOverwrite}
      />
    </div>
  );
}
