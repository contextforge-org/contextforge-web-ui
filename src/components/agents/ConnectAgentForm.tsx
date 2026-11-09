import type { ReactNode } from "react";
import { useIntl } from "react-intl";
import { Loader2 } from "lucide-react";
import { AgentIcon } from "@/components/icons/AgentIcon";
import { BasicAuth } from "@/components/mcp-servers/BasicAuth";
import { BearerTokenAuth } from "@/components/mcp-servers/BearerTokenAuth";
import { CustomHeadersAuth } from "@/components/mcp-servers/CustomHeadersAuth";
import { QueryParameterAuth } from "@/components/mcp-servers/QueryParameterAuth";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { useConnectAgentForm } from "@/hooks/useConnectAgentForm";
import { useTagSuggestions } from "@/hooks/useTagSuggestions";
import { MAX_TAGS } from "@/utils/tags";
import type { A2AAgentRead } from "@/generated/types";
import { ManualAgentFields } from "./ManualAgentFields";
import { VisibilityFields } from "./VisibilityFields";
import { summarizeEndpoint, summarizeInterfaces, summarizeRequirements } from "./agentCardSummary";

interface ConnectAgentFormProps {
  /** Leave the form without registering anything. */
  onCancel: () => void;
  /** The agent was registered. */
  onCreated: (agent: A2AAgentRead) => void;
}

const INPUT_CLASS =
  "rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500";

function StepHeader({ title, badge }: { title: string; badge?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-agent-icon-bg">
        <AgentIcon className="h-3.5 w-3.5 text-black" aria-hidden="true" />
      </div>
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h2>
      {badge}
    </div>
  );
}

function ExpandableSection({
  label,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  children: ReactNode;
  /** Controlled when given; otherwise the section manages itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const controlled = open !== undefined;
  return (
    <Accordion
      type="single"
      collapsible
      className="rounded-md border border-border"
      {...(controlled
        ? {
            value: open ? "section" : "",
            onValueChange: (value: string) => onOpenChange?.(value === "section"),
          }
        : {})}
    >
      <AccordionItem value="section" className="border-b-0">
        <AccordionTrigger className="px-3 py-2.5 text-sm font-normal text-muted-foreground hover:no-underline">
          {label}
        </AccordionTrigger>
        <AccordionContent className="space-y-5 px-3">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function ViewMore({ children }: { children: ReactNode }) {
  const intl = useIntl();
  return (
    <ExpandableSection label={intl.formatMessage({ id: "agents.connect.viewMore" })}>
      {children}
    </ExpandableSection>
  );
}

function FormActions({
  onCancel,
  onContinue,
  continueLabel,
  isBusy = false,
  continueDisabled = false,
}: {
  onCancel: () => void;
  onContinue: () => void;
  continueLabel: string;
  isBusy?: boolean;
  continueDisabled?: boolean;
}) {
  const intl = useIntl();
  return (
    <div className="flex items-center justify-end gap-3 pt-2">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isBusy}>
        {intl.formatMessage({ id: "common.button.cancel" })}
      </Button>
      <Button
        type="submit"
        size="sm"
        onClick={onContinue}
        disabled={isBusy || continueDisabled}
        aria-busy={isBusy}
      >
        {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {continueLabel}
      </Button>
    </div>
  );
}

export function ConnectAgentForm({ onCancel, onCreated }: ConnectAgentFormProps) {
  const intl = useIntl();
  const form = useConnectAgentForm({ onCreated });
  const tagSuggestions = useTagSuggestions();
  const card = form.result?.card;

  const handleBack = () => {
    if (!form.goBack()) onCancel();
  };

  return (
    <div className="mx-auto w-full max-w-[728px] pt-10">
      <BackButton onClick={handleBack} />

      {form.step === "url" && (
        <Card>
          <CardContent>
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                // With "Enter manually" open the form registers the details typed
                // there; otherwise it reads the card at the URL.
                void (form.manualOpen ? form.submitManual() : form.submitUrl());
              }}
            >
              <StepHeader title={intl.formatMessage({ id: "agents.connect.title" })} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {intl.formatMessage({ id: "agents.connect.url.intro" })}
              </p>

              <Field
                id="agent-url"
                required
                info={intl.formatMessage({ id: "agents.connect.url.info" })}
                error={form.errors.url}
                label={intl.formatMessage({ id: "agents.connect.url.label" })}
                labelProps={{ className: "inline-flex items-center gap-0.5" }}
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    autoFocus
                    value={form.url}
                    onChange={(event) => form.setUrl(event.target.value)}
                    placeholder={intl.formatMessage({ id: "agents.connect.url.placeholder" })}
                    className={INPUT_CLASS}
                  />
                )}
              </Field>

              {form.cardUnavailable && (
                <Callout severity="warning">
                  {intl.formatMessage({ id: "agents.connect.outcome.noCard" })}
                </Callout>
              )}

              <ExpandableSection
                label={intl.formatMessage({ id: "agents.connect.manual.toggle" })}
                open={form.manualOpen}
                onOpenChange={form.setManualOpen}
              >
                <ManualAgentFields form={form} />
              </ExpandableSection>

              {form.manualOpen && form.errors.submit && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/50"
                >
                  <p className="text-sm text-red-600 dark:text-red-400">{form.errors.submit}</p>
                </div>
              )}

              <FormActions
                onCancel={onCancel}
                onContinue={() => undefined}
                continueLabel={intl.formatMessage({
                  id: form.manualOpen
                    ? form.isSubmitting
                      ? "agents.connect.auth.submitting"
                      : "agents.connect.auth.submit"
                    : form.isFetching
                      ? "agents.connect.checking"
                      : "agents.connect.continue",
                })}
                isBusy={form.isFetching || form.isSubmitting}
              />
            </form>
          </CardContent>
        </Card>
      )}

      {form.step === "review" && card && (
        <Card>
          <CardContent className="space-y-4">
            <StepHeader
              title={card.name}
              badge={
                card.version ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                    {intl.formatMessage(
                      { id: "agents.connect.review.badge" },
                      { version: card.version },
                    )}
                  </span>
                ) : undefined
              }
            />
            {card.description && (
              <p className="text-xs leading-relaxed text-muted-foreground">{card.description}</p>
            )}

            {(card.skills?.length ?? 0) > 0 && (
              <section aria-labelledby="agent-review-skills" className="space-y-2">
                <h3 id="agent-review-skills" className="text-xs font-semibold text-foreground">
                  {intl.formatMessage(
                    { id: "agents.connect.review.skills" },
                    { count: card.skills?.length ?? 0 },
                  )}
                </h3>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {card.skills?.map((skill, index) => (
                    <li key={`${skill.id ?? skill.name}-${index}`}>{skill.name}</li>
                  ))}
                </ul>
              </section>
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-border pt-4 text-xs">
              {(
                [
                  [
                    "agents.connect.review.version",
                    form.result?.detectedVersion
                      ? intl.formatMessage(
                          { id: "agents.connect.review.a2aVersion" },
                          { version: form.result.detectedVersion },
                        )
                      : "",
                  ],
                  ["agents.connect.review.endpoint", summarizeEndpoint(card)],
                  ["agents.connect.review.interfaces", summarizeInterfaces(card)],
                  ["agents.connect.review.requires", summarizeRequirements(card)],
                ] as const
              )
                .filter(([, value]) => value)
                .map(([labelId, value]) => (
                  <div key={labelId} className="contents">
                    <dt className="font-semibold text-foreground">
                      {intl.formatMessage({ id: labelId })}
                    </dt>
                    <dd className="min-w-0 break-words text-muted-foreground">{value}</dd>
                  </div>
                ))}
            </dl>

            {(form.result?.warnings?.length ?? 0) > 0 && (
              <ViewMore>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {form.result?.warnings?.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </ViewMore>
            )}

            <FormActions
              onCancel={onCancel}
              onContinue={form.goToAuth}
              continueLabel={intl.formatMessage({ id: "agents.connect.continue" })}
            />
          </CardContent>
        </Card>
      )}

      {form.step === "auth" && (
        <Card>
          <CardContent>
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void form.submit();
              }}
            >
              <StepHeader
                title={intl.formatMessage({
                  id: form.authType ? "agents.connect.auth.title" : "agents.connect.auth.titleNone",
                })}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {intl.formatMessage({
                  id: form.authType ? "agents.connect.auth.intro" : "agents.connect.auth.introNone",
                })}
              </p>

              {!form.isAuthSupported && (
                <Callout severity="warning">
                  {intl.formatMessage({ id: "agents.connect.auth.unsupported" })}
                </Callout>
              )}

              {form.authType === "bearer" && (
                <BearerTokenAuth token={form.token} onTokenChange={form.setToken} />
              )}
              {form.authType === "basic" && (
                <BasicAuth
                  username={form.username}
                  password={form.password}
                  onUsernameChange={form.setUsername}
                  onPasswordChange={form.setPassword}
                />
              )}
              {form.authType === "authheaders" && (
                <CustomHeadersAuth
                  headers={form.headers}
                  onHeadersChange={form.setHeaders}
                  maxHeaders={1}
                />
              )}
              {form.authType === "query_param" && (
                <QueryParameterAuth
                  parameterName={form.queryParamName}
                  apiKey={form.queryParamValue}
                  onParameterNameChange={form.setQueryParamName}
                  onApiKeyChange={form.setQueryParamValue}
                />
              )}
              {form.errors.credentials && (
                <p role="alert" className="text-sm text-destructive">
                  {form.errors.credentials}
                </p>
              )}

              <VisibilityFields
                visibility={form.visibility}
                onVisibilityChange={form.setVisibility}
                teams={form.teams}
                teamId={form.teamId}
                onTeamChange={form.setTeamId}
                teamError={form.errors.teamId}
              />

              <ViewMore>
                <Field
                  id="agent-tags"
                  label={intl.formatMessage({ id: "agents.connect.auth.tags" })}
                >
                  {(controlProps) => (
                    <TagInput
                      {...controlProps}
                      value={form.tags}
                      onChange={form.setTags}
                      suggestions={tagSuggestions}
                      maxTags={MAX_TAGS}
                      placeholder={intl.formatMessage({ id: "common.tagInput.placeholder" })}
                    />
                  )}
                </Field>
              </ViewMore>

              {form.errors.submit && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/50"
                >
                  <p className="text-sm text-red-600 dark:text-red-400">{form.errors.submit}</p>
                </div>
              )}

              <FormActions
                onCancel={onCancel}
                onContinue={() => undefined}
                continueLabel={intl.formatMessage({
                  id: form.isSubmitting
                    ? "agents.connect.auth.submitting"
                    : "agents.connect.auth.submit",
                })}
                isBusy={form.isSubmitting}
                continueDisabled={!form.isAuthSupported}
              />
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
