import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Info, Loader2 } from "lucide-react";
import { STATUS_ICON } from "@/lib/status";
import { useIntl, type IntlShape } from "react-intl";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup } from "../ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { JsonHighlighter } from "../ui/json-highlighter";
import { serversApi } from "@/api/servers";
import type {
  GatewayHandshakeRequest,
  GatewayHandshakeResponse,
  GatewayTestRequest,
  GatewayTestResponse,
} from "@/generated/types";
import { parseApiError } from "@/lib/errorUtils";
import { cn } from "@/lib/utils";

interface TestConnectionPanelProps {
  serverUrl: string;
}

type TestStatus = "idle" | "testing" | "success" | "error";
type TestMode = "http" | "handshake";

const FAILURE_CLASS_MESSAGE_IDS: Record<string, string> = {
  transport: "mcpServer.testConnection.failureClass.transport",
  protocol: "mcpServer.testConnection.failureClass.protocol",
  auth: "mcpServer.testConnection.failureClass.auth",
  invalid_response: "mcpServer.testConnection.failureClass.invalidResponse",
};

const CREDENTIAL_SOURCE_MESSAGE_IDS: Record<string, string> = {
  stored: "mcpServer.testConnection.credentialSource.stored",
  form: "mcpServer.testConnection.credentialSource.form",
  none: "mcpServer.testConnection.credentialSource.none",
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[128px_minmax(0,1fr)] items-start gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function getHandshakeHeadline(response: GatewayHandshakeResponse, intl: IntlShape): string {
  return response?.success
    ? intl.formatMessage({ id: "mcpServer.testConnection.handshakeSucceeded" })
    : intl.formatMessage({ id: "mcpServer.testConnection.handshakeFailed" });
}

const HTTP_METHODS = ["Get", "Post", "Put", "Delete", "Patch"] as const;

// Matches the URL validation convention used in useMCPServerForm/useToolForm:
// required, and constrained to http/https schemes.
const testUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required.")
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must start with http:// or https://." },
  );

type FieldErrors = {
  url?: string;
  path?: string;
  headers?: string;
  body?: string;
};

// Field-level validators. Each returns an error message, or undefined when the
// value is acceptable. Shared by the on-blur checks and the pre-submit sweep so
// the two never drift.
function validateUrl(value: string): string | undefined {
  const result = testUrlSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0].message;
}

// Path is a suffix appended to the base URL; the backend normalizes leading and
// trailing slashes, so we don't police those. This is a soft guard against the
// common fat-finger of pasting a full URL (scheme + host) into the Path field.
function validatePath(value: string): string | undefined {
  return value.includes("://")
    ? "Path shouldn't include a scheme or host (e.g. https://…)."
    : undefined;
}

function validateHeaders(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return "Headers must be a JSON object.";
    }
    // Both test endpoints type header values as strings; a number or nested
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

function sendsBodyFor(method: string): boolean {
  return method !== "Get" && method !== "HEAD";
}

// Only JSON bodies are validated; form-encoded (and other) content types are
// sent verbatim, so there is nothing to parse.
function validateBody(value: string, method: string, contentType: string): string | undefined {
  if (!sendsBodyFor(method) || !value.trim() || contentType !== "application/json") {
    return undefined;
  }
  try {
    JSON.parse(value);
  } catch (e) {
    return `Invalid body JSON: ${e instanceof Error ? e.message : "Parse error"}`;
  }
  return undefined;
}

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

export function TestConnectionPanel({ serverUrl }: TestConnectionPanelProps) {
  const intl = useIntl();
  const [status, setStatus] = useState<TestStatus>("idle");
  const [mode, setMode] = useState<TestMode>("http");
  const [method, setMethod] = useState<string>("Get");
  const [url, setUrl] = useState<string>(serverUrl);
  const [path, setPath] = useState<string>("");
  const [headers, setHeaders] = useState<string>("");
  const [contentType, setContentType] = useState<string>("application/json");
  const [body, setBody] = useState<string>("");
  const [response, setResponse] = useState<GatewayTestResponse>(null);
  const [handshakeResponse, setHandshakeResponse] = useState<GatewayHandshakeResponse>(null);
  const [error, setError] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});
  // Aborted on unmount or via Cancel to avoid state updates on a stale request.
  const abortRef = useRef<AbortController | null>(null);

  // Drop a field's inline error as soon as the user edits it; validation runs
  // again on blur and on submit.
  const clearError = useCallback((field: keyof FieldErrors) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleTest = useCallback(async () => {
    setStatus("idle");
    setResponse(null);
    setHandshakeResponse(null);
    setError("");

    // Validate every field up front and surface problems inline; don't send a
    // request while anything is invalid.
    const nextErrors: FieldErrors = {
      url: validateUrl(url),
      path: validatePath(path),
      headers: validateHeaders(headers),
      body: mode === "http" ? validateBody(body, method, contentType) : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.url || nextErrors.path || nextErrors.headers || nextErrors.body) {
      return;
    }

    // Fields are valid — parse the headers JSON, which is validated and sent
    // in both modes.
    const parsedHeaders: Record<string, string> | undefined = headers.trim()
      ? (JSON.parse(headers) as Record<string, string>)
      : undefined;

    // Cancel any previous in-flight request before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("testing");

    if (mode === "handshake") {
      const handshakePayload: GatewayHandshakeRequest = {
        baseUrl: url.trim(),
        ...(path.trim() ? { path: path.trim() } : {}),
        ...(parsedHeaders ? { headers: parsedHeaders } : {}),
      };
      try {
        const result = await serversApi.testHandshake(handshakePayload, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setHandshakeResponse(result);
        setStatus(result?.success ? "success" : "error");
      } catch (e) {
        if (controller.signal.aborted) {
          return;
        }
        setHandshakeResponse(null);
        setStatus("error");
        setError(
          parseApiError(e, intl.formatMessage({ id: "mcpServer.testConnection.handshakeError" })),
        );
      }
      return;
    }

    // HTTP mode only from here: the body is validated above only in this mode,
    // so parsing it before the handshake branch returns would throw on input
    // that handshake mode never sends. JSON bodies are parsed to an object so
    // the backend forwards them as JSON; form-encoded bodies are sent as-is.
    let parsedBody: string | Record<string, unknown> | undefined;
    if (sendsBodyFor(method) && body.trim()) {
      parsedBody =
        contentType === "application/json" ? (JSON.parse(body) as Record<string, unknown>) : body;
    }

    const payload: GatewayTestRequest = {
      method: method.toUpperCase(),
      baseUrl: url.trim(),
      path: path.trim(),
      contentType,
      ...(parsedHeaders ? { headers: parsedHeaders } : {}),
      ...(parsedBody !== undefined ? { body: parsedBody } : {}),
    };

    try {
      const result = await serversApi.testConnectivity(payload, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      const statusCode = result?.statusCode ?? 0;
      const succeeded = statusCode >= 200 && statusCode < 300;
      setResponse(result);
      setStatus(succeeded ? "success" : "error");
    } catch (e) {
      if (controller.signal.aborted) {
        return;
      }
      setResponse(null);
      setStatus("error");
      setError(parseApiError(e, "Connection test failed. Please try again."));
    }
  }, [url, headers, body, method, path, contentType, mode, intl]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  // Switching modes discards the previous run: the two modes render different
  // result shapes, and a stale HTTP response next to a handshake form reads as
  // if the handshake had already succeeded.
  const handleModeChange = useCallback((value: string) => {
    setMode(value as TestMode);
    setStatus("idle");
    setResponse(null);
    setHandshakeResponse(null);
    setError("");
    setErrors({});
  }, []);

  const responseBodyText = useMemo(() => {
    if (!response?.body) return "";
    return typeof response.body === "string"
      ? response.body
      : JSON.stringify(response.body, null, 2);
  }, [response]);

  const handshakeRawPreview = useMemo(() => {
    if (!handshakeResponse?.rawPreview) return "";
    try {
      return JSON.stringify(JSON.parse(handshakeResponse.rawPreview), null, 2);
    } catch {
      return handshakeResponse.rawPreview;
    }
  }, [handshakeResponse]);

  const handshakeCountChips = useMemo(() => {
    const counts = handshakeResponse?.componentCounts;
    if (!counts) return [];
    return ["tools", "resources", "prompts"].filter((key) => counts[key] != null);
  }, [handshakeResponse]);

  const copyText = mode === "http" ? responseBodyText : handshakeRawPreview;

  const headline =
    mode === "handshake"
      ? getHandshakeHeadline(handshakeResponse, intl)
      : response
        ? `Status: ${response.statusCode} ${status === "success" ? "OK" : "error"}`
        : error || "Connection failed";

  const isTesting = status === "testing";
  const hasResult = status === "success" || status === "error";

  const formGrid = (
    <div className="grid gap-6 @3xl:grid-cols-2">
      {/* Left column — request form */}
      <div className="space-y-4">
        {/* Test type */}
        <div className="space-y-2">
          <FieldLabel htmlFor="test-mode">
            {intl.formatMessage({ id: "mcpServer.testConnection.mode.label" })}
          </FieldLabel>
          <Select value={mode} onValueChange={handleModeChange} disabled={isTesting}>
            <SelectTrigger
              id="test-mode"
              className="w-full bg-transparent dark:bg-transparent dark:hover:bg-transparent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">
                {intl.formatMessage({ id: "mcpServer.testConnection.mode.http" })}
              </SelectItem>
              <SelectItem value="handshake">
                {intl.formatMessage({ id: "mcpServer.testConnection.mode.handshake" })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* URL */}
        <div className="space-y-2">
          <FieldLabel htmlFor="url" required hint="The full URL of the MCP server to test.">
            URL
          </FieldLabel>
          <Input
            id="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              clearError("url");
            }}
            onBlur={() => setErrors((prev) => ({ ...prev, url: validateUrl(url) }))}
            placeholder="https://mcp.github.com/mcp"
            disabled={isTesting}
            aria-invalid={!!errors.url}
            aria-describedby={errors.url ? "url-error" : undefined}
            className="bg-transparent dark:bg-transparent"
          />
          {errors.url && (
            <p id="url-error" className="text-sm text-destructive">
              {errors.url}
            </p>
          )}
        </div>

        {/* Method */}
        {mode === "http" && (
          <div className="space-y-2">
            <FieldLabel>Method</FieldLabel>
            <RadioGroup
              value={method}
              onValueChange={setMethod}
              disabled={isTesting}
              aria-label="Method"
              className="flex w-full gap-1 rounded-md bg-muted p-1"
            >
              {HTTP_METHODS.map((m) => (
                <RadioGroupPrimitive.Item
                  key={m}
                  value={m}
                  className={cn(
                    "flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                    "text-muted-foreground hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "disabled:pointer-events-none disabled:opacity-50",
                    "data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
                  )}
                >
                  {m}
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroup>
          </div>
        )}

        {/* Path */}
        <div className="space-y-2">
          <FieldLabel htmlFor="path" hint="Optional path appended to the URL.">
            Path
          </FieldLabel>
          <Input
            id="path"
            value={path}
            onChange={(e) => {
              setPath(e.target.value);
              clearError("path");
            }}
            onBlur={() => setErrors((prev) => ({ ...prev, path: validatePath(path) }))}
            placeholder="/health"
            disabled={isTesting}
            aria-invalid={!!errors.path}
            aria-describedby={errors.path ? "path-error" : undefined}
            className="bg-transparent dark:bg-transparent"
          />
          {errors.path && (
            <p id="path-error" className="text-sm text-destructive">
              {errors.path}
            </p>
          )}
        </div>

        {/* Content type */}
        {mode === "http" && (
          <div className="space-y-2">
            <FieldLabel htmlFor="content-type">Content type</FieldLabel>
            <Select value={contentType} onValueChange={setContentType} disabled={isTesting}>
              <SelectTrigger
                id="content-type"
                className="w-full bg-transparent dark:bg-transparent dark:hover:bg-transparent"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="application/json">application/json</SelectItem>
                <SelectItem value="application/x-www-form-urlencoded">
                  application/x-www-form-urlencoded
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Headers */}
        <div className="space-y-2">
          <FieldLabel htmlFor="headers" hint="Request headers as a JSON object.">
            Headers
          </FieldLabel>
          <Textarea
            id="headers"
            value={headers}
            onChange={(e) => {
              setHeaders(e.target.value);
              clearError("headers");
            }}
            onBlur={() => setErrors((prev) => ({ ...prev, headers: validateHeaders(headers) }))}
            placeholder="Add request headers as JSON..."
            className="min-h-[96px] bg-transparent font-mono text-sm focus-visible:ring-1 focus-visible:ring-offset-0"
            disabled={isTesting}
            aria-invalid={!!errors.headers}
            aria-describedby={
              [
                errors.headers ? "headers-error" : null,
                mode === "handshake" ? "headers-hint" : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          {errors.headers && (
            <p id="headers-error" className="text-sm text-destructive">
              {errors.headers}
            </p>
          )}
          {mode === "handshake" && (
            <p id="headers-hint" className="text-[13px] text-muted-foreground">
              {intl.formatMessage({ id: "mcpServer.testConnection.storedCredentialsHint" })}
            </p>
          )}
        </div>

        {/* Body — not applicable to GET requests */}
        {mode === "http" && method !== "Get" && (
          <div className="space-y-2">
            <FieldLabel htmlFor="body" hint="Request body sent with non-GET methods.">
              Body
            </FieldLabel>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                clearError("body");
              }}
              onBlur={() =>
                setErrors((prev) => ({
                  ...prev,
                  body: validateBody(body, method, contentType),
                }))
              }
              placeholder="Add request body as JSON..."
              className="min-h-[116px] bg-transparent font-mono text-sm focus-visible:ring-1 focus-visible:ring-offset-0"
              disabled={isTesting}
              aria-invalid={!!errors.body}
              aria-describedby={errors.body ? "body-error" : undefined}
            />
            {errors.body && (
              <p id="body-error" className="text-sm text-destructive">
                {errors.body}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right column — action button + response panel */}
      <div className="flex flex-col gap-2">
        {/* Mirror the left column's label row: a fixed label-height band so the
              response panel below lines up with the URL input. The button is taller
              than the band and overflows it upward instead of pushing the panel down. */}
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

        <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-md border border-input bg-transparent">
          {status === "idle" && (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <p className="text-sm text-muted-foreground">Run a test to see the response here.</p>
            </div>
          )}

          {isTesting && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Running test…</p>
            </div>
          )}

          {hasResult && (
            <div
              className="relative flex flex-1 flex-col gap-2 overflow-auto p-4"
              role={status === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {copyText && (
                <CopyButton
                  value={copyText}
                  label={intl.formatMessage({ id: "mcpServer.testConnection.copyResponseBody" })}
                  className="absolute right-2 top-2 size-6 bg-background/80 text-muted-foreground backdrop-blur-sm hover:bg-muted hover:text-foreground"
                />
              )}
              <div className="flex items-start gap-2 pr-8">
                {status === "success" ? (
                  <STATUS_ICON.success className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <STATUS_ICON.error className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <span className="text-sm font-medium break-words text-foreground">{headline}</span>
              </div>

              {mode === "http" ? (
                <>
                  {response && (
                    <p className="pl-6 text-[13px] text-muted-foreground">
                      Latency: {response.latencyMs} ms
                    </p>
                  )}

                  {responseBodyText && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[13px] text-muted-foreground">Response body:</p>
                      <pre className="max-h-[420px] overflow-auto text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
                        <code className="break-words">
                          <JsonHighlighter text={responseBodyText} />
                        </code>
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {handshakeResponse && (
                    <p className="pl-6 text-[13px] text-muted-foreground">
                      Latency: {handshakeResponse.latencyMs} ms
                    </p>
                  )}

                  {handshakeResponse && (
                    <dl className="mt-1 space-y-1.5 pl-6 text-[13px]">
                      {handshakeResponse.serverName && (
                        <DetailRow
                          label={intl.formatMessage({
                            id: "mcpServer.testConnection.serverName",
                          })}
                        >
                          {handshakeResponse.serverName}
                        </DetailRow>
                      )}
                      {handshakeResponse.serverVersion && (
                        <DetailRow
                          label={intl.formatMessage({
                            id: "mcpServer.testConnection.serverVersion",
                          })}
                        >
                          {handshakeResponse.serverVersion}
                        </DetailRow>
                      )}
                      {handshakeResponse.protocolVersion && (
                        <DetailRow
                          label={intl.formatMessage({
                            id: "mcpServer.testConnection.protocolVersion",
                          })}
                        >
                          {handshakeResponse.protocolVersion}
                        </DetailRow>
                      )}
                      {handshakeResponse.negotiationPath && (
                        <DetailRow
                          label={intl.formatMessage({
                            id: "mcpServer.testConnection.negotiationPath",
                          })}
                        >
                          {NEGOTIATION_PATH_MESSAGE_IDS[handshakeResponse.negotiationPath]
                            ? intl.formatMessage({
                                id: NEGOTIATION_PATH_MESSAGE_IDS[handshakeResponse.negotiationPath],
                              })
                            : handshakeResponse.negotiationPath}
                        </DetailRow>
                      )}
                      <DetailRow
                        label={intl.formatMessage({
                          id: "mcpServer.testConnection.credentialSource",
                        })}
                      >
                        {CREDENTIAL_SOURCE_MESSAGE_IDS[handshakeResponse.credentialSource ?? "none"]
                          ? intl.formatMessage({
                              id: CREDENTIAL_SOURCE_MESSAGE_IDS[
                                handshakeResponse.credentialSource ?? "none"
                              ],
                            })
                          : (handshakeResponse.credentialSource ?? "none")}
                      </DetailRow>
                    </dl>
                  )}

                  {handshakeResponse?.success && handshakeCountChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {handshakeCountChips.map((key) => {
                        const count = handshakeResponse.componentCounts?.[key] ?? 0;
                        const messageIds = handshakeResponse.countsPartial
                          ? PARTIAL_COUNT_MESSAGE_IDS
                          : COUNT_MESSAGE_IDS;
                        return (
                          <Badge key={key} variant="secondary">
                            {intl.formatMessage({ id: messageIds[key] }, { count })}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {status === "error" && (
                    <div className="mt-1 space-y-2 pl-6">
                      {handshakeResponse?.failureClass && (
                        <Badge variant="destructive">
                          {FAILURE_CLASS_MESSAGE_IDS[handshakeResponse.failureClass]
                            ? intl.formatMessage({
                                id: FAILURE_CLASS_MESSAGE_IDS[handshakeResponse.failureClass],
                              })
                            : handshakeResponse.failureClass}
                        </Badge>
                      )}
                      {(handshakeResponse?.error || error) && (
                        <p className="text-[13px] text-muted-foreground">
                          {handshakeResponse?.error ?? error}
                        </p>
                      )}
                    </div>
                  )}

                  {handshakeRawPreview && (
                    <details className="mt-2 pl-6">
                      <summary className="cursor-pointer text-[13px] text-muted-foreground">
                        {intl.formatMessage({ id: "mcpServer.testConnection.rawResponse" })}
                      </summary>
                      <pre className="mt-1 overflow-auto text-[13px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
                        <code className="break-words">
                          <JsonHighlighter text={handshakeRawPreview} />
                        </code>
                      </pre>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return <div className="@container">{formGrid}</div>;
}
