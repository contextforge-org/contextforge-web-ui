import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, CircleAlert, Info, Loader2, TriangleAlert } from "lucide-react";
import { useIntl, type IntlShape } from "react-intl";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { JsonHighlighter } from "../ui/json-highlighter";
import { CopyValue } from "../ui/copy-value";
import { testVirtualServerHandshake } from "@/api/virtualServers";
import type { GatewayHandshakeResponse } from "@/generated/types";
import { parseApiError } from "@/lib/errorUtils";
import { cn } from "@/lib/utils";

interface HandshakeTestPanelProps {
  serverId: string;
  /** The virtual server's own MCP endpoint, shown for reference only — the backend derives the actual test target from `serverId`, not from this value. */
  serverUrl: string;
  /**
   * The virtual server's own aggregated component counts (e.g.
   * `{ tools: 3, resources: 1, prompts: 0 }`), used to flag a mismatch
   * against the counts the handshake itself reports. A federated source
   * being unreachable, or filtering having diverged, shows up as a
   * mismatch here.
   */
  aggregatedCounts?: Record<string, number>;
}

type TestStatus = "idle" | "testing" | "success" | "error";

type FieldErrors = {
  headers?: string;
};

function validateHeaders(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return "Headers must be a JSON object.";
    }
    // The handshake endpoint types header values as strings; a number or nested
    // object would only come back as a 422 from the backend.
    if (
      Object.values(parsed as Record<string, unknown>).some(
        (headerValue) => typeof headerValue !== "string",
      )
    ) {
      return "Header values must be strings.";
    }
  } catch (e) {
    return `Invalid headers JSON: ${e instanceof Error ? e.message : "Parse error"}`;
  }
  return undefined;
}

// Per-class actionable copy, unlike TestConnectionPanel's gateway-URL handshake this one
// runs in-process against this virtual server's own endpoint (no outbound call, no
// caller-editable URL), so the copy must not tell the user to check a URL.
const FAILURE_CLASS_COPY_MESSAGE_IDS: Record<string, string> = {
  transport: "mcpServer.testConnection.virtualServer.failureCopy.transport",
  protocol: "mcpServer.testConnection.virtualServer.failureCopy.protocol",
  auth: "mcpServer.testConnection.virtualServer.failureCopy.auth",
  invalid_response: "mcpServer.testConnection.virtualServer.failureCopy.invalidResponse",
};

// Keys match GatewayHandshakeResponseFailureClass; shared with TestConnectionPanel's map.
const FAILURE_CLASS_MESSAGE_IDS: Record<string, string> = {
  transport: "mcpServer.testConnection.failureClass.transport",
  protocol: "mcpServer.testConnection.failureClass.protocol",
  auth: "mcpServer.testConnection.failureClass.auth",
  invalid_response: "mcpServer.testConnection.failureClass.invalidResponse",
};

// Keys match GatewayHandshakeResponseCredentialSource. This panel's copy (including the
// "session" source unique to the virtual-server handshake) differs from
// TestConnectionPanel's, so it gets its own message group rather than reusing that one.
const CREDENTIAL_SOURCE_MESSAGE_IDS: Record<string, string> = {
  stored: "mcpServer.testConnection.virtualServer.credentialSource.stored",
  form: "mcpServer.testConnection.virtualServer.credentialSource.form",
  none: "mcpServer.testConnection.virtualServer.credentialSource.none",
  session: "mcpServer.testConnection.virtualServer.credentialSource.session",
};

const NEGOTIATION_PATH_MESSAGE_IDS: Record<string, string> = {
  server_discover: "mcpServer.testConnection.negotiationPath.serverDiscover",
  initialize: "mcpServer.testConnection.negotiationPath.initialize",
};

const COUNT_MESSAGE_IDS: Record<string, string> = {
  tools: "mcpServer.testConnection.counts.tools",
  resources: "mcpServer.testConnection.counts.resources",
  prompts: "mcpServer.testConnection.counts.prompts",
};

// Deliberately plain substitution, not ICU plural: the "+" means "at least",
// so "1+ tools" is correct even when the first page holds a single item.
const PARTIAL_COUNT_MESSAGE_IDS: Record<string, string> = {
  tools: "mcpServer.testConnection.countsPartial.tools",
  resources: "mcpServer.testConnection.countsPartial.resources",
  prompts: "mcpServer.testConnection.countsPartial.prompts",
};

function FieldLabel({
  htmlFor,
  children,
  required,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium">
      <span>
        {children}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {hint && (
        <Info className="size-3.5 text-muted-foreground">
          <title>{hint}</title>
        </Info>
      )}
    </Label>
  );
}

function CountBadge({
  type,
  count,
  expected,
  partial,
  intl,
}: {
  type: string;
  count: number;
  expected?: number;
  partial: boolean;
  intl: IntlShape;
}) {
  // Partial counts are a first-page lower bound: the true count can only be
  // >= what's reported, so a reported count still under the expected total
  // isn't necessarily a real mismatch, but a reported count already over it is.
  const mismatch = expected !== undefined && (partial ? count > expected : count !== expected);
  const messageIds = partial ? PARTIAL_COUNT_MESSAGE_IDS : COUNT_MESSAGE_IDS;
  const countText = messageIds[type]
    ? intl.formatMessage({ id: messageIds[type] }, { count })
    : `${count} ${type}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
        mismatch
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "bg-muted text-muted-foreground",
      )}
      title={
        mismatch
          ? intl.formatMessage(
              { id: "mcpServer.testConnection.virtualServer.countMismatchTooltip" },
              { count, expected },
            )
          : undefined
      }
    >
      <span className={cn("font-medium", mismatch ? "" : "text-foreground")}>{countText}</span>
      {expected !== undefined && (
        <span className="text-[10px] opacity-75">
          {intl.formatMessage(
            { id: "mcpServer.testConnection.virtualServer.countExpectedSuffix" },
            { expected },
          )}
        </span>
      )}
      {mismatch && <TriangleAlert className="size-3" aria-hidden="true" />}
    </span>
  );
}

function getCountMismatchKeys(
  componentCounts: Record<string, number> | null | undefined,
  aggregatedCounts: Record<string, number> | undefined,
  countsPartial: boolean,
): string[] {
  if (!aggregatedCounts) return [];
  const keys = new Set([...Object.keys(componentCounts ?? {}), ...Object.keys(aggregatedCounts)]);
  return Array.from(keys).filter((key) => {
    const count = componentCounts?.[key] ?? 0;
    const expected = aggregatedCounts[key];
    return countsPartial ? count > expected : count !== expected;
  });
}

function HandshakeResultPanel({
  status,
  result,
  error,
  aggregatedCounts,
  intl,
}: {
  status: TestStatus;
  result: GatewayHandshakeResponse;
  error: string;
  aggregatedCounts?: Record<string, number>;
  intl: IntlShape;
}) {
  if (status === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">Run a test to see the result here.</p>
      </div>
    );
  }

  if (status === "testing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Running handshake…</p>
      </div>
    );
  }

  const succeeded = status === "success";
  // Only compare against the aggregate when the handshake actually returned
  // counts — a transport/auth failure that never reached the server has
  // nothing to compare, and showing "0 / N" badges there would just restate
  // the failure as a misleading mismatch.
  const hasHandshakeCounts = result?.componentCounts != null;
  const countsPartial = Boolean(result?.countsPartial);
  const mismatchKeys = hasHandshakeCounts
    ? getCountMismatchKeys(result.componentCounts, aggregatedCounts, countsPartial)
    : [];
  const allCountKeys = hasHandshakeCounts
    ? Array.from(
        new Set([
          ...Object.keys(result.componentCounts ?? {}),
          ...Object.keys(aggregatedCounts ?? {}),
        ]),
      )
    : [];

  return (
    <div
      className="relative flex flex-1 flex-col gap-3 overflow-auto p-4"
      role={succeeded ? "status" : "alert"}
      aria-live="polite"
    >
      {/* Headline */}
      <div className="flex items-start gap-2">
        {succeeded ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-500" />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        )}
        <span className="text-sm font-medium text-foreground">
          {succeeded
            ? intl.formatMessage({ id: "mcpServer.testConnection.handshakeSucceeded" })
            : (result?.error ??
              error ??
              intl.formatMessage({ id: "mcpServer.testConnection.handshakeFailed" }))}
        </span>
      </div>

      {/* Credential used — always shown, per security requirement */}
      {result?.credentialSource && (
        <p className="pl-6 text-[13px] text-muted-foreground">
          {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.credentialLabel" })}{" "}
          <span className="text-foreground">
            {CREDENTIAL_SOURCE_MESSAGE_IDS[result.credentialSource]
              ? intl.formatMessage({ id: CREDENTIAL_SOURCE_MESSAGE_IDS[result.credentialSource] })
              : result.credentialSource}
          </span>
        </p>
      )}

      {result && (
        <>
          {/* Latency */}
          <p className="pl-6 text-[13px] text-muted-foreground">Latency: {result.latencyMs} ms</p>

          {/* Negotiation path */}
          {result.negotiationPath && (
            <p className="pl-6 text-[13px] text-muted-foreground">
              {intl.formatMessage({ id: "mcpServer.testConnection.negotiationPath" })}:{" "}
              <span className="font-mono">
                {NEGOTIATION_PATH_MESSAGE_IDS[result.negotiationPath]
                  ? intl.formatMessage({ id: NEGOTIATION_PATH_MESSAGE_IDS[result.negotiationPath] })
                  : result.negotiationPath}
              </span>
            </p>
          )}

          {/* Server identity */}
          {(result.serverName ?? result.serverVersion ?? result.protocolVersion) && (
            <div className="space-y-0.5 pl-6 text-[13px] text-muted-foreground">
              {result.serverName && (
                <p>
                  {intl.formatMessage({ id: "mcpServer.testConnection.serverName" })}:{" "}
                  <span className="text-foreground">{result.serverName}</span>
                  {result.serverVersion && (
                    <span className="ml-1 text-muted-foreground">v{result.serverVersion}</span>
                  )}
                </p>
              )}
              {result.protocolVersion && (
                <p>
                  {intl.formatMessage({ id: "mcpServer.testConnection.protocolVersion" })}:{" "}
                  <span className="font-mono text-foreground">{result.protocolVersion}</span>
                </p>
              )}
            </div>
          )}

          {/* Capabilities */}
          {result.capabilities && Object.keys(result.capabilities).length > 0 && (
            <div className="pl-6 text-[13px] text-muted-foreground">
              <p>
                {intl.formatMessage({
                  id: "mcpServer.testConnection.virtualServer.capabilitiesLabel",
                })}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.keys(result.capabilities).map((capability) => (
                  <span
                    key={capability}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Component counts, cross-checked against the virtual server's own aggregate */}
          {allCountKeys.length > 0 && (
            <div className="pl-6">
              <div className="flex flex-wrap gap-1.5">
                {allCountKeys.map((key) => (
                  <CountBadge
                    key={key}
                    type={key}
                    count={result.componentCounts?.[key] ?? 0}
                    expected={aggregatedCounts?.[key]}
                    partial={countsPartial}
                    intl={intl}
                  />
                ))}
                {countsPartial && (
                  <span className="self-center text-[11px] text-muted-foreground">
                    {intl.formatMessage({
                      id: "mcpServer.testConnection.virtualServer.countPartialMarker",
                    })}
                  </span>
                )}
              </div>
              {mismatchKeys.length > 0 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {intl.formatMessage({
                      id: "mcpServer.testConnection.virtualServer.countMismatchBanner",
                    })}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Failure class + actionable copy */}
          {!succeeded && result.failureClass && (
            <div className="pl-6 text-[13px] text-muted-foreground">
              <p>
                {intl.formatMessage({
                  id: "mcpServer.testConnection.virtualServer.failureClassLabel",
                })}{" "}
                <span className="font-mono">
                  {FAILURE_CLASS_MESSAGE_IDS[result.failureClass]
                    ? intl.formatMessage({ id: FAILURE_CLASS_MESSAGE_IDS[result.failureClass] })
                    : result.failureClass}
                </span>
              </p>
              <p className="mt-0.5 text-foreground">
                {intl.formatMessage({
                  id:
                    FAILURE_CLASS_COPY_MESSAGE_IDS[result.failureClass] ??
                    "mcpServer.testConnection.virtualServer.failureCopy.default",
                })}
              </p>
            </div>
          )}

          {/* Raw preview */}
          {result.rawPreview && (
            <div className="mt-1 space-y-1">
              <p className="text-[13px] text-muted-foreground">Raw preview:</p>
              <pre className="max-h-[320px] overflow-auto text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
                <code className="break-words">
                  <JsonHighlighter text={result.rawPreview} />
                </code>
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function HandshakeTestPanel({
  serverId,
  serverUrl,
  aggregatedCounts,
}: HandshakeTestPanelProps) {
  const intl = useIntl();
  const [status, setStatus] = useState<TestStatus>("idle");
  const [headers, setHeaders] = useState<string>("");
  const [result, setResult] = useState<GatewayHandshakeResponse>(null);
  const [error, setError] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback((field: keyof FieldErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleTest = useCallback(async () => {
    setResult(null);
    setError("");

    const nextErrors: FieldErrors = {
      headers: validateHeaders(headers),
    };
    setErrors(nextErrors);
    if (nextErrors.headers) {
      return;
    }

    const parsedHeaders: Record<string, string> | undefined = headers.trim()
      ? (JSON.parse(headers) as Record<string, string>)
      : undefined;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("testing");
    try {
      const res = await testVirtualServerHandshake(
        serverId,
        parsedHeaders ? { headers: parsedHeaders } : {},
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResult(res);
      setStatus(res?.success ? "success" : "error");
    } catch (e) {
      if (controller.signal.aborted) return;
      setResult(null);
      setStatus("error");
      setError(parseApiError(e, "Handshake test failed. Please try again."));
    }
  }, [serverId, headers]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  const isTesting = status === "testing";
  const hasResult = status === "success" || status === "error";

  return (
    <div className="@container space-y-6">
      <div className="grid gap-6 @3xl:grid-cols-2">
        {/* Left column — request form */}
        <div className="space-y-4">
          {/* Endpoint — informational only. The backend derives the actual
              test target from the server's own ID, so this isn't editable. */}
          <div className="space-y-2">
            <FieldLabel hint="The virtual server's own MCP endpoint. The backend tests this server directly — it isn't editable here.">
              Endpoint
            </FieldLabel>
            <div className="rounded-md border border-input bg-transparent px-3 py-2">
              <CopyValue label="endpoint" value={serverUrl} />
            </div>
          </div>

          {/* Headers */}
          <div className="space-y-2">
            <FieldLabel
              htmlFor="handshake-headers"
              hint="Optional headers as a JSON object (e.g. Authorization). By default your own session credentials are reused; headers here override them."
            >
              Headers
            </FieldLabel>
            <Textarea
              id="handshake-headers"
              value={headers}
              onChange={(e) => {
                setHeaders(e.target.value);
                clearError("headers");
              }}
              onBlur={() => setErrors((prev) => ({ ...prev, headers: validateHeaders(headers) }))}
              placeholder='{"Authorization": "Bearer …"}'
              className="min-h-[96px] bg-transparent font-mono text-sm focus-visible:ring-1 focus-visible:ring-offset-0"
              disabled={isTesting}
              aria-invalid={!!errors.headers}
              aria-describedby={errors.headers ? "handshake-headers-error" : undefined}
            />
            {errors.headers && (
              <p id="handshake-headers-error" className="text-sm text-red-500">
                {errors.headers}
              </p>
            )}
          </div>
        </div>

        {/* Right column — action button + result panel */}
        <div className="flex flex-col gap-2">
          <div className="flex h-5 items-end justify-end gap-3">
            {isTesting && (
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            <Button onClick={handleTest} disabled={isTesting}>
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running test…
                </>
              ) : hasResult ? (
                "Re-test connection"
              ) : (
                "Test connection"
              )}
            </Button>
          </div>

          <div
            className={cn(
              "flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-md border border-input bg-transparent",
            )}
          >
            <HandshakeResultPanel
              status={status}
              result={result}
              error={error}
              aggregatedCounts={aggregatedCounts}
              intl={intl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
