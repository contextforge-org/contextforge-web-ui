import { useIntl } from "react-intl";
import { BasicAuth } from "@/components/mcp-servers/BasicAuth";
import { CustomHeadersAuth } from "@/components/mcp-servers/CustomHeadersAuth";
import { QueryParameterAuth } from "@/components/mcp-servers/QueryParameterAuth";
import { BackButton } from "@/components/ui/back-button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ExpandableSection } from "@/components/ui/expandable-section";
import { FormInput } from "@/components/ui/form-input";
import {
  useConnectAgentForm,
  type CardIssue,
  type ConnectAgentFormState,
} from "@/hooks/useConnectAgentForm";
import type { A2AAgentRead } from "@/generated/types";
import { AgentCardReview } from "./AgentCardReview";
import { ManualAgentFields } from "./ManualAgentFields";
import { TagsAndDescriptionFields } from "./TagsAndDescriptionFields";
import { VisibilityFields } from "./VisibilityFields";
import { FormActions, StepHeader, SubmitError, TextField, ViewMore } from "./agentFormParts";

interface ConnectAgentFormProps {
  /** Leave the form without registering anything. */
  onCancel: () => void;
  /** The agent was registered. */
  onCreated: (agent: A2AAgentRead) => void;
}

/** Why the card could not be read, as the message shown above "Enter manually". */
const CARD_ISSUE_MESSAGE_IDS: Record<CardIssue, string> = {
  no_card: "agents.connect.outcome.noCard",
  auth_required: "agents.connect.outcome.authRequired",
  unreachable: "agents.connect.outcome.unreachable",
  error: "agents.connect.outcome.error",
};

/** With "Enter manually" open the button registers the typed details; otherwise it reads the card. */
function urlStepButtonMessageId(form: ConnectAgentFormState): string {
  if (form.manualOpen) {
    return form.isSubmitting ? "agents.connect.auth.submitting" : "agents.connect.auth.submit";
  }
  return form.isFetching ? "agents.connect.checking" : "agents.connect.continue";
}

export function ConnectAgentForm({ onCancel, onCreated }: ConnectAgentFormProps) {
  const intl = useIntl();
  const form = useConnectAgentForm({ onCreated });

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
                // Entering the details by hand does not read the URL, so it is optional then.
                required={!form.manualOpen}
                info={intl.formatMessage({ id: "agents.connect.url.info" })}
                error={form.errors.url}
                label={intl.formatMessage({ id: "agents.connect.url.label" })}
                labelProps={{ className: "inline-flex items-center gap-0.5" }}
              >
                {(controlProps) => (
                  <FormInput
                    {...controlProps}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    autoFocus
                    value={form.url}
                    onChange={(event) => form.setUrl(event.target.value)}
                    placeholder={intl.formatMessage({ id: "agents.connect.url.placeholder" })}
                  />
                )}
              </Field>

              {form.cardIssue && (
                <Callout severity="warning">
                  {intl.formatMessage({ id: CARD_ISSUE_MESSAGE_IDS[form.cardIssue] })}
                </Callout>
              )}

              <ExpandableSection
                label={intl.formatMessage({ id: "agents.connect.manual.toggle" })}
                open={form.manualOpen}
                onOpenChange={form.setManualOpen}
              >
                <ManualAgentFields form={form} />
              </ExpandableSection>

              {form.errors.submit && <SubmitError message={form.errors.submit} />}

              <FormActions
                onCancel={onCancel}
                onContinue={() => undefined}
                continueLabel={intl.formatMessage({ id: urlStepButtonMessageId(form) })}
                isBusy={form.isFetching || form.isSubmitting}
              />
            </form>
          </CardContent>
        </Card>
      )}

      {form.step === "review" && <AgentCardReview form={form} onCancel={onCancel} />}

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
              <StepHeader title={intl.formatMessage({ id: "agents.connect.auth.title" })} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {intl.formatMessage({
                  id: form.singleKey ? "agents.connect.auth.introKey" : "agents.connect.auth.intro",
                })}
              </p>

              {!form.isAuthSupported && (
                <Callout severity="warning">
                  {intl.formatMessage({ id: "agents.connect.auth.unsupported" })}
                </Callout>
              )}

              {form.singleKey && (
                <TextField
                  id="agent-key"
                  required
                  type="password"
                  label={intl.formatMessage({ id: "agents.connect.auth.key.label" })}
                  placeholder={intl.formatMessage({ id: "agents.connect.auth.key.placeholder" })}
                  value={form.keyValue}
                  onChange={form.setKeyValue}
                />
              )}
              {form.authType === "basic" && (
                <BasicAuth
                  username={form.username}
                  password={form.password}
                  onUsernameChange={form.setUsername}
                  onPasswordChange={form.setPassword}
                />
              )}
              {/* The card named no header or parameter, so the user has to. */}
              {form.authType === "authheaders" && !form.singleKey && (
                <CustomHeadersAuth
                  headers={form.headers}
                  onHeadersChange={form.setHeaders}
                  maxHeaders={1}
                />
              )}
              {form.authType === "query_param" && !form.singleKey && (
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
                <TagsAndDescriptionFields
                  idPrefix="agent-card"
                  tags={form.cardTags}
                  onTagsChange={form.setCardTags}
                  description={form.cardDescription}
                  onDescriptionChange={form.setCardDescription}
                />
              </ViewMore>

              {form.errors.submit && <SubmitError message={form.errors.submit} />}

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
