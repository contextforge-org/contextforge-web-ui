import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { useIntl, type IntlShape } from "react-intl";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { JsonHighlighter } from "../ui/json-highlighter";
import { CopyButton } from "../ui/copy-button";
import { TruncatedText } from "../ui/truncated-text";
import { testVirtualServerHandshake } from "@/api/virtualServers";
import type { GatewayHandshakeResponse } from "@/generated/types";
import { parseApiError } from "@/lib/errorUtils";
import { formatLastSeen } from "@/utils/format";
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

const COMPONENT_TYPE_LABEL_IDS: Record<string, string> = {
  tools: "gateways.details.filter.tools",
  resources: "gateways.details.filter.resources",
  prompts: "gateways.details.filter.prompts",
};

const MATCHES_AGGREGATE_MESSAGE_IDS: Record<string, string> = {
  tools: "mcpServer.testConnection.virtualServer.matchesAggregate.tools",
  resources: "mcpServer.testConnection.virtualServer.matchesAggregate.resources",
  prompts: "mcpServer.testConnection.virtualServer.matchesAggregate.prompts",
};

const MISMATCHES_AGGREGATE_MESSAGE_IDS: Record<string, string> = {
  tools: "mcpServer.testConnection.virtualServer.mismatchAggregate.tools",
  resources: "mcpServer.testConnection.virtualServer.mismatchAggregate.resources",
  prompts: "mcpServer.testConnection.virtualServer.mismatchAggregate.prompts",
};

function getCapabilityFlags(
  capabilities: Record<string, unknown> | null | undefined,
  type: string,
): string[] {
  const value = capabilities?.[type];
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>);
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

/** A trigger box styled to match the "Change test credential" / "Handshake response" affordance. */
function DisclosureTrigger({
  open,
  onClick,
  children,
  controls,
}: {
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
  controls: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="flex h-10 w-full items-center gap-2 rounded-md border border-input px-3 text-left text-[13px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      aria-expanded={open}
      aria-controls={controls}
    >
      <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Button>
  );
}

function StatusDot({ tone }: { tone: "success" | "error" }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "success" ? "bg-green-500" : "bg-destructive",
      )}
      aria-hidden="true"
    />
  );
}

function ComponentRow({
  type,
  count,
  countsPartial,
  capabilities,
  aggregatedCounts,
  intl,
}: {
  type: string;
  count: number;
  countsPartial: boolean;
  capabilities: Record<string, unknown> | null | undefined;
  aggregatedCounts?: Record<string, number>;
  intl: IntlShape;
}) {
  const expected = aggregatedCounts?.[type];
  const hasComparison = expected !== undefined;
  const mismatch = hasComparison && (countsPartial ? count > expected : count !== expected);
  const flags = getCapabilityFlags(capabilities, type);
  const typeLabel = COMPONENT_TYPE_LABEL_IDS[type]
    ? intl.formatMessage({ id: COMPONENT_TYPE_LABEL_IDS[type] })
    : type;
  const returnedText = intl.formatMessage(
    {
      id: countsPartial
        ? "mcpServer.testConnection.virtualServer.countReturnedPartial"
        : "mcpServer.testConnection.virtualServer.countReturned",
    },
    { count },
  );

  return (
    <div
      className={cn(
        "grid grid-cols-[104px_88px_160px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-1.5 text-[13px]",
        // Below 600px, and again between 1024-1200px, the panel is too narrow for the
        // fixed-width grid to fit without clipping, but not narrow enough to be worth a
        // dedicated third layout — drop to a wrapping flex row in both bands so the
        // "matches..." column falls to its own line instead of overflowing.
        "max-[599px]:flex max-[599px]:flex-wrap max-[599px]:gap-x-4",
        "min-[1024px]:max-[1200px]:flex min-[1024px]:max-[1200px]:flex-wrap min-[1024px]:max-[1200px]:gap-x-4",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground",
          "max-[599px]:w-24 max-[599px]:shrink-0",
          "min-[1024px]:max-[1200px]:w-24 min-[1024px]:max-[1200px]:shrink-0",
        )}
      >
        <Circle className="h-1.5 w-1.5 shrink-0 fill-current text-green-500" aria-hidden="true" />
        {typeLabel}
      </span>
      <span
        className={cn(
          "text-muted-foreground",
          "max-[599px]:w-20 max-[599px]:shrink-0",
          "min-[1024px]:max-[1200px]:w-20 min-[1024px]:max-[1200px]:shrink-0",
        )}
      >
        {returnedText}
      </span>
      <span
        className={cn(
          "min-w-0 text-muted-foreground",
          "max-[599px]:min-w-28 max-[599px]:shrink-0",
          "min-[1024px]:max-[1200px]:min-w-28 min-[1024px]:max-[1200px]:shrink-0",
        )}
      >
        {flags.length > 0 ? flags.join(" · ") : null}
      </span>
      {hasComparison && (
        <span
          className={cn(
            "flex min-w-0 items-start justify-start gap-1.5 text-left",
            "max-[599px]:min-w-44 max-[599px]:flex-1",
            "min-[1024px]:max-[1200px]:min-w-44 min-[1024px]:max-[1200px]:flex-1",
            mismatch ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
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
          {mismatch ? (
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleCheck className="size-3.5 shrink-0 text-green-500" aria-hidden="true" />
          )}
          {intl.formatMessage({
            id: mismatch
              ? MISMATCHES_AGGREGATE_MESSAGE_IDS[type]
              : MATCHES_AGGREGATE_MESSAGE_IDS[type],
          })}
        </span>
      )}
    </div>
  );
}

function HandshakeResultPanel({
  status,
  result,
  error,
  testedAt,
  aggregatedCounts,
  intl,
}: {
  status: TestStatus;
  result: GatewayHandshakeResponse;
  error: string;
  testedAt: number | null;
  aggregatedCounts?: Record<string, number>;
  intl: IntlShape;
}) {
  if (status === "idle") {
    return (
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.idlePlaceholder" })}
      </p>
    );
  }

  if (status === "testing") {
    return (
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.runningHandshake" })}
        </p>
      </div>
    );
  }

  const succeeded = status === "success";
  // Only compare against the aggregate when the handshake actually returned
  // counts — a transport/auth failure that never reached the server has
  // nothing to compare, and showing a false "match" there would just restate
  // the failure as misleading progress.
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
  const totalComponents = hasHandshakeCounts
    ? Object.values(result.componentCounts ?? {}).reduce((sum, n) => sum + n, 0)
    : undefined;

  const testedText =
    testedAt == null
      ? null
      : Math.round((Date.now() - testedAt) / 1000) === 0
        ? intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.testedJustNow" })
        : (() => {
            const relative = formatLastSeen(new Date(testedAt).toISOString(), {
              locale: intl.locale,
            });
            return relative
              ? intl.formatMessage(
                  { id: "mcpServer.testConnection.virtualServer.testedAgo" },
                  { relative },
                )
              : null;
          })();

  const metaParts: React.ReactNode[] = [];
  if (result?.protocolVersion) {
    metaParts.push(
      <span key="protocol">
        {intl.formatMessage(
          { id: "mcpServer.testConnection.virtualServer.protocolMeta" },
          { version: result.protocolVersion },
        )}
      </span>,
    );
  }
  if (result?.serverName) {
    metaParts.push(
      <span key="server">
        {result.serverName}
        {result.serverVersion ? ` ${result.serverVersion}` : ""}
      </span>,
    );
  }
  if (totalComponents !== undefined) {
    metaParts.push(
      <span key="components">
        {intl.formatMessage(
          { id: "mcpServer.testConnection.virtualServer.totalComponents" },
          { count: totalComponents },
        )}
      </span>,
    );
  }
  if (result) {
    metaParts.push(
      <span key="latency">
        {intl.formatMessage(
          { id: "mcpServer.testConnection.virtualServer.latencyMeta" },
          { ms: result.latencyMs },
        )}
      </span>,
    );
  }
  if (result?.negotiationPath) {
    const pathLabel = NEGOTIATION_PATH_MESSAGE_IDS[result.negotiationPath]
      ? intl.formatMessage({ id: NEGOTIATION_PATH_MESSAGE_IDS[result.negotiationPath] })
      : result.negotiationPath;
    metaParts.push(
      <span key="path" className="font-mono">
        {intl.formatMessage(
          { id: "mcpServer.testConnection.virtualServer.pathMeta" },
          { path: pathLabel },
        )}
      </span>,
    );
  }
  if (result?.credentialSource) {
    metaParts.push(
      <span key="credential">
        {CREDENTIAL_SOURCE_MESSAGE_IDS[result.credentialSource]
          ? intl.formatMessage({ id: CREDENTIAL_SOURCE_MESSAGE_IDS[result.credentialSource] })
          : result.credentialSource}
      </span>,
    );
  }

  return (
    <div className="space-y-4" role={succeeded ? "status" : "alert"} aria-live="polite">
      {/* Headline */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          {succeeded ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-500" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.connectionTest" })}
            </p>
            {testedText && <p className="text-[10px] text-muted-foreground">{testedText}</p>}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <StatusDot tone={succeeded ? "success" : "error"} />
          {intl.formatMessage({
            id: succeeded
              ? "mcpServer.testConnection.virtualServer.connected"
              : "mcpServer.testConnection.virtualServer.failed",
          })}
        </span>
      </div>

      {!succeeded && (
        <p className="text-sm text-foreground">
          {result?.error ??
            error ??
            intl.formatMessage({ id: "mcpServer.testConnection.handshakeFailed" })}
        </p>
      )}

      {metaParts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {metaParts.map((part, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground/40">
                  &bull;
                </span>
              )}
              {part}
            </span>
          ))}
        </div>
      )}

      {/* Component counts, cross-checked against the virtual server's own aggregate */}
      {allCountKeys.length > 0 && (
        <div>
          {allCountKeys.map((key) => (
            <ComponentRow
              key={key}
              type={key}
              count={result?.componentCounts?.[key] ?? 0}
              countsPartial={countsPartial}
              capabilities={result?.capabilities}
              aggregatedCounts={aggregatedCounts}
              intl={intl}
            />
          ))}
        </div>
      )}
      {mismatchKeys.length > 0 && (
        <p className="flex items-start gap-1.5 text-[13px] text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {intl.formatMessage({
              id: "mcpServer.testConnection.virtualServer.countMismatchBanner",
            })}
          </span>
        </p>
      )}

      {/* Failure class + actionable copy */}
      {!succeeded && result?.failureClass && (
        <div className="text-[13px] text-muted-foreground">
          <p>
            {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.failureClassLabel" })}{" "}
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
      {result?.rawPreview && (
        <HandshakeResponseDisclosure rawPreview={result.rawPreview} intl={intl} />
      )}
    </div>
  );
}

function HandshakeResponseDisclosure({
  rawPreview,
  intl,
}: {
  rawPreview: string;
  intl: IntlShape;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <DisclosureTrigger
        open={open}
        onClick={() => setOpen((v) => !v)}
        controls="handshake-response-panel"
      >
        {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.handshakeResponse" })}
      </DisclosureTrigger>
      {open && (
        <div id="handshake-response-panel" className="mt-2 rounded-md border border-input p-3">
          <pre className="max-h-[320px] overflow-auto text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
            <code className="break-words">
              <JsonHighlighter text={rawPreview} />
            </code>
          </pre>
        </div>
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
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [result, setResult] = useState<GatewayHandshakeResponse>(null);
  const [error, setError] = useState<string>("");
  const [testedAt, setTestedAt] = useState<number | null>(null);
  // Cancel only appears once a test has been running long enough that
  // aborting it is actually useful — avoids a flash for fast/local servers.
  const [showCancel, setShowCancel] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCancelTimer = useCallback(() => {
    if (cancelTimerRef.current) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearCancelTimer();
    },
    [clearCancelTimer],
  );

  const handleTest = useCallback(async () => {
    setResult(null);
    setError("");
    setShowCancel(false);
    clearCancelTimer();

    const trimmedToken = token.trim();
    const headers = trimmedToken
      ? { Authorization: /^bearer\s/i.test(trimmedToken) ? trimmedToken : `Bearer ${trimmedToken}` }
      : undefined;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("testing");
    cancelTimerRef.current = setTimeout(() => setShowCancel(true), 350);
    try {
      const res = await testVirtualServerHandshake(
        serverId,
        headers ? { headers } : {},
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResult(res);
      setTestedAt(Date.now());
      setStatus(res?.success ? "success" : "error");
    } catch (e) {
      if (controller.signal.aborted) return;
      setResult(null);
      setTestedAt(Date.now());
      setStatus("error");
      setError(
        parseApiError(e, intl.formatMessage({ id: "mcpServer.testConnection.handshakeError" })),
      );
    } finally {
      clearCancelTimer();
    }
  }, [serverId, token, intl, clearCancelTimer]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    clearCancelTimer();
    setShowCancel(false);
    setStatus("idle");
  }, [clearCancelTimer]);

  const isTesting = status === "testing";
  const hasResult = status === "success" || status === "error";

  return (
    <div className="space-y-6">
      {/* Endpoint — informational only. The backend derives the actual
          test target from the server's own ID, so this isn't editable. */}
      <div className="space-y-1.5">
        <label className="text-[13px] font-medium text-foreground">
          {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.endpointLabel" })}
        </label>
        <div className="flex items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TruncatedText className="min-w-0 font-mono text-sm text-foreground">
              {serverUrl}
            </TruncatedText>
            <CopyButton
              value={serverUrl}
              label={intl.formatMessage(
                { id: "common.copyValue" },
                {
                  label: intl.formatMessage({
                    id: "mcpServer.testConnection.virtualServer.endpointLabel",
                  }),
                },
              )}
              className="size-5 shrink-0 text-muted-foreground"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isTesting && showCancel && (
              <Button type="button" variant="ghost" size="xs" onClick={handleCancel}>
                {intl.formatMessage({ id: "common.button.cancel" })}
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.runningTest" })}
                </>
              ) : hasResult ? (
                intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.retestButton" })
              ) : (
                intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.testButton" })
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Change test credential */}
      <div>
        <DisclosureTrigger
          open={credentialOpen}
          onClick={() => setCredentialOpen((v) => !v)}
          controls="test-credential-panel"
        >
          {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.changeCredential" })}
        </DisclosureTrigger>
        {credentialOpen && (
          <div id="test-credential-panel" className="mt-5 space-y-2">
            <label htmlFor="handshake-token" className="text-[13px] font-medium text-foreground">
              {intl.formatMessage({
                id: "mcpServer.testConnection.virtualServer.bearerTokenLabel",
              })}
            </label>
            <div className="relative">
              <Input
                id="handshake-token"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={intl.formatMessage({
                  id: "mcpServer.testConnection.virtualServer.bearerTokenPlaceholder",
                })}
                disabled={isTesting}
                className="pr-10 font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowToken((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto text-muted-foreground"
                aria-label={intl.formatMessage({
                  id: showToken
                    ? "mcpServer.testConnection.virtualServer.hideToken"
                    : "mcpServer.testConnection.virtualServer.showToken",
                })}
                aria-pressed={showToken}
              >
                {showToken ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {intl.formatMessage({ id: "mcpServer.testConnection.virtualServer.bearerTokenHint" })}
            </p>
          </div>
        )}
      </div>

      {/* Result panel */}
      <div className="rounded-md border border-input p-4">
        <HandshakeResultPanel
          status={status}
          result={result}
          error={error}
          testedAt={testedAt}
          aggregatedCounts={aggregatedCounts}
          intl={intl}
        />
      </div>
    </div>
  );
}
