import { useIntl } from "react-intl";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useEditAgentForm } from "@/hooks/useEditAgentForm";
import type { A2AAgentRead } from "@/generated/types";
import type { Agent } from "@/types/agent";
import { AgentAuthFields, AUTH_TYPE_LABEL_IDS } from "./AgentAuthFields";
import { FormActions, StepHeader, SubmitError, TextField } from "./agentFormParts";
import { TagsAndDescriptionFields } from "./TagsAndDescriptionFields";
import { VisibilityFields } from "./VisibilityFields";
import {
  AGENT_AUTH_TYPES,
  PROTOCOL_VERSIONS,
  type ProtocolBinding,
  type ProtocolVersion,
} from "./manualAgent";

/**
 * Auth types the edit form can replace a credential with. OAuth is left out until its
 * fields are shared with the connect form; an agent that uses it keeps its settings.
 */
const EDITABLE_AUTH_TYPES = AGENT_AUTH_TYPES.filter((type) => type !== "oauth");

interface EditAgentFormProps {
  /** The agent to edit, as the list holds it. */
  agent: Agent;
  /** Leave the form without saving. */
  onCancel: () => void;
  /** The agent was saved, or nothing needed saving (`null`). */
  onSaved: (updated: A2AAgentRead | null) => void;
}

export function EditAgentForm({ agent, onCancel, onSaved }: EditAgentFormProps) {
  const intl = useIntl();
  const form = useEditAgentForm({ agent, onSaved });

  return (
    <div className="mx-auto w-full max-w-[728px] pt-10">
      <BackButton onClick={onCancel} />

      <Card>
        <CardContent>
          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.submit();
            }}
          >
            <StepHeader
              title={intl.formatMessage({ id: "agents.edit.title" }, { name: agent.name })}
            />

            <TextField
              id="agent-edit-name"
              required
              label={intl.formatMessage({ id: "agents.connect.manual.name.label" })}
              placeholder={intl.formatMessage({ id: "agents.connect.manual.name.placeholder" })}
              value={form.name}
              onChange={form.setName}
              error={form.errors.name}
            />

            <VisibilityFields
              idPrefix="agent-edit"
              visibility={form.visibility}
              onVisibilityChange={form.setVisibility}
              teams={form.teams}
              teamId={form.teamId}
              onTeamChange={form.setTeamId}
              teamError={form.errors.teamId}
            />

            <TextField
              id="agent-edit-endpoint"
              required
              type="url"
              label={intl.formatMessage({ id: "agents.connect.manual.endpoint.label" })}
              info={intl.formatMessage({ id: "agents.connect.manual.endpoint.info" })}
              placeholder={intl.formatMessage({ id: "agents.connect.manual.endpoint.placeholder" })}
              value={form.endpointUrl}
              onChange={form.setEndpointUrl}
              error={form.errors.endpoint}
            />

            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <fieldset className="space-y-2">
                <legend className="mb-2.5 text-sm font-medium text-foreground">
                  {intl.formatMessage({ id: "agents.connect.manual.binding.label" })}
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </legend>
                <RadioGroup
                  // With none set the gateway picks one, which the JSON-RPC option stands for.
                  value={form.protocolBinding ?? "jsonrpc"}
                  onValueChange={(value) => form.setProtocolBinding(value as ProtocolBinding)}
                  aria-label={intl.formatMessage({ id: "agents.connect.manual.binding.label" })}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="jsonrpc" id="agent-edit-binding-jsonrpc" />
                    <Label htmlFor="agent-edit-binding-jsonrpc" className="font-normal">
                      {intl.formatMessage({ id: "agents.connect.manual.binding.jsonrpc" })}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="http_json" id="agent-edit-binding-http" />
                    <Label htmlFor="agent-edit-binding-http" className="font-normal">
                      {intl.formatMessage({ id: "agents.connect.manual.binding.http" })}
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-2.5 text-sm font-medium text-foreground">
                  {intl.formatMessage({ id: "agents.connect.manual.version.label" })}
                </legend>
                <RadioGroup
                  value={form.protocolVersion}
                  onValueChange={(value) => form.setProtocolVersion(value as ProtocolVersion)}
                  aria-label={intl.formatMessage({ id: "agents.connect.manual.version.label" })}
                >
                  {PROTOCOL_VERSIONS.map((version) => (
                    <div key={version} className="flex items-center gap-2">
                      <RadioGroupItem value={version} id={`agent-edit-version-${version}`} />
                      <Label htmlFor={`agent-edit-version-${version}`} className="font-normal">
                        {intl.formatMessage(
                          { id: "agents.connect.manual.version.option" },
                          { version },
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </fieldset>
            </div>

            <section
              // The credential tabs carry their own "Authentication type" label.
              aria-labelledby={form.changingAuth ? "agent-edit-auth-type-label" : "agent-edit-auth"}
              className="space-y-3"
            >
              {!form.changingAuth && (
                <h3 id="agent-edit-auth" className="text-sm font-medium text-foreground">
                  {intl.formatMessage({ id: "mcpServer.advanced.authTypeLabel" })}
                </h3>
              )}
              {form.changingAuth ? (
                <>
                  <AgentAuthFields
                    idPrefix="agent-edit-auth"
                    types={EDITABLE_AUTH_TYPES}
                    type={form.authType}
                    onTypeChange={form.setAuthType}
                    values={form.auth}
                    onChange={form.patchAuthValues}
                  />
                  {form.errors.credentials && (
                    <p role="alert" className="text-sm text-destructive">
                      {form.errors.credentials}
                    </p>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={form.keepAuth}>
                    {intl.formatMessage({ id: "agents.edit.auth.keep" })}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {form.currentAuthType === "none"
                      ? intl.formatMessage({ id: "agents.edit.auth.noneStored" })
                      : intl.formatMessage(
                          { id: "agents.edit.auth.current" },
                          {
                            type: intl.formatMessage({
                              id: AUTH_TYPE_LABEL_IDS[form.currentAuthType],
                            }),
                          },
                        )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={form.startChangingAuth}
                  >
                    {intl.formatMessage({ id: "agents.edit.auth.change" })}
                  </Button>
                </>
              )}
            </section>

            <TagsAndDescriptionFields
              idPrefix="agent-edit"
              tags={form.tags}
              onTagsChange={form.setTags}
              description={form.description}
              onDescriptionChange={form.setDescription}
            />

            {form.errors.submit && <SubmitError message={form.errors.submit} />}

            <FormActions
              onCancel={onCancel}
              onContinue={() => undefined}
              continueLabel={intl.formatMessage({
                id: form.isSubmitting ? "agents.edit.saving" : "agents.edit.save",
              })}
              isBusy={form.isSubmitting}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
