import { CheckCircle2, CircleMinus, CircleX, Loader2 } from "lucide-react";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import type { OAuthConnectionValidationState } from "@/hooks/useOAuthConnectionValidation";
import { oauthErrorMessage, VALIDATION_STAGES } from "@/lib/oauthConnectionValidation";

export interface OAuthConnectionValidationPanelProps {
  name: string;
  entry?: OAuthConnectionValidationState;
  onTest: () => void;
  onCancel: () => void;
  onAuthorize?: () => void;
  actionsOnly?: boolean;
  resultOnly?: boolean;
}

export function OAuthConnectionValidationPanel({
  name,
  entry,
  onTest,
  onCancel,
  onAuthorize,
  actionsOnly = false,
  resultOnly = false,
}: OAuthConnectionValidationPanelProps) {
  const intl = useIntl();
  const message = (key: string) => intl.formatMessage({ id: `mcpServer.oauthValidation.${key}` });
  const running = entry?.state === "running";
  const result = entry?.result;
  return (
    <section
      role="group"
      aria-label={intl.formatMessage({ id: "mcpServer.oauthValidation.label" }, { name })}
      className="space-y-3 text-sm"
    >
      {!resultOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="xs" disabled={running} onClick={onTest}>
            {running && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {message(running ? "testing" : entry ? "retest" : "test")}
          </Button>
          {running && (
            <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
              {message("cancel")}
            </Button>
          )}
          {entry?.state === "failure" && result?.reauthorizationRequired && onAuthorize && (
            <Button type="button" variant="outline" size="xs" onClick={onAuthorize}>
              {message("authorize")}
            </Button>
          )}
        </div>
      )}
      {!actionsOnly && entry && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={running}
          className="space-y-2"
        >
          <p className="font-medium">
            {message(running ? "testing" : entry.state === "success" ? "success" : "failure")}
          </p>
          {result?.stages && (
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {VALIDATION_STAGES.map((stage) => {
                const status = result.stages?.[stage] ?? "skipped";
                const Icon =
                  status === "ok" ? CheckCircle2 : status === "failed" ? CircleX : CircleMinus;
                return (
                  <li key={stage} className="flex items-center gap-1.5">
                    <Icon
                      className={`size-4 ${status === "ok" ? "text-success" : status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                      aria-hidden="true"
                    />
                    {message(`stage.${stage}`)}: {message(`outcome.${status}`)}
                  </li>
                );
              })}
            </ul>
          )}
          {entry.state === "failure" && <p>{oauthErrorMessage(intl, entry.errorCode)}</p>}
          {entry.state === "success" && result?.componentCounts?.tools !== undefined && (
            <p>
              {intl.formatMessage(
                {
                  id: `mcpServer.testConnection.${result.countsPartial ? "countsPartial" : "counts"}.tools`,
                },
                { count: result.componentCounts.tools },
              )}
            </p>
          )}
          {entry.testedAt && (
            <p className="text-xs text-muted-foreground">
              {intl.formatMessage(
                { id: "mcpServer.oauthValidation.testedAt" },
                { time: intl.formatTime(entry.testedAt) },
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
