import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ExpandableSection } from "@/components/ui/expandable-section";
import { Field } from "@/components/ui/field";
import { FormInput } from "@/components/ui/form-input";
import type { ConnectAgentFormState } from "@/hooks/useConnectAgentForm";
import { FormActions, StepHeader, SubmitError } from "./agentFormParts";
import { getAgentSkillNames } from "./agentSkills";
import {
  capabilityRows,
  describedSkills,
  interfaceRows,
  isCardSigned,
  joinModes,
  summarizeEndpoint,
  summarizeInterfaces,
  summarizePublisher,
  summarizeRequirements,
} from "./agentCardSummary";

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <div className="space-y-1 text-xs text-muted-foreground">{children}</div>
    </section>
  );
}

/** A label and value on one line, with the value column aligned across rows. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-4">
      <span>{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

interface AgentCardReviewProps {
  form: ConnectAgentFormState;
  onCancel: () => void;
}

/**
 * Step 2 of the card flow: what the agent's card says, to confirm. "View more"
 * opens the rest of the card, and the one thing the user may change here: the name
 * the agent is registered under.
 */
export function AgentCardReview({ form, onCancel }: AgentCardReviewProps) {
  const intl = useIntl();
  const card = form.result?.card;
  const [detailsOpen, setDetailsOpen] = useState(false);

  // The name lives in the expanded section, so open it when it needs attention.
  useEffect(() => {
    if (form.errors.name) setDetailsOpen(true);
  }, [form.errors.name]);

  if (!card) return null;

  const requirements = summarizeRequirements(card, intl);
  const publisher = summarizePublisher(card);
  const interfaces = interfaceRows(card);
  const capabilities = capabilityRows(card);
  const inputModes = joinModes(card.defaultInputModes);
  const outputModes = joinModes(card.defaultOutputModes);
  const skills = describedSkills(card);
  const skillNames = getAgentSkillNames(card);
  const warnings = form.result?.warnings ?? [];
  const version = form.result?.detectedVersion;
  const signed = isCardSigned(card);
  const yesNo = (enabled: boolean) =>
    intl.formatMessage({ id: enabled ? "agents.connect.review.yes" : "agents.connect.review.no" });

  const summaryRows: Array<[string, React.ReactNode]> = [
    [
      "agents.connect.review.version",
      version ? (
        <>
          {intl.formatMessage({ id: "agents.connect.review.a2aVersion" }, { version })}
          {signed && (
            <span className="ml-3">
              {intl.formatMessage({ id: "agents.connect.review.signed" })}
            </span>
          )}
        </>
      ) : (
        ""
      ),
    ],
    ["agents.connect.review.endpoint", summarizeEndpoint(card)],
    ["agents.connect.review.interfaces", summarizeInterfaces(card, intl)],
    ["agents.connect.review.requires", requirements],
  ];

  return (
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

        {skillNames.length > 0 && (
          <section aria-labelledby="agent-review-skills" className="space-y-2">
            <h3 id="agent-review-skills" className="text-xs font-semibold text-foreground">
              {intl.formatMessage(
                { id: "agents.connect.review.skills" },
                { count: skillNames.length },
              )}
            </h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {skillNames.map((name, index) => (
                // Index in the key too: skill names aren't guaranteed unique on one agent.
                <li key={`${name}-${index}`}>{name}</li>
              ))}
            </ul>
          </section>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-border pt-4 text-xs">
          {summaryRows
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

        <ExpandableSection
          label={intl.formatMessage({ id: "agents.connect.viewMore" })}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        >
          <Field
            id="agent-review-name"
            required
            error={form.errors.name}
            label={intl.formatMessage({ id: "agents.connect.review.name.label" })}
          >
            {(controlProps) => (
              <FormInput
                {...controlProps}
                autoComplete="off"
                value={form.agentName}
                onChange={(event) => form.setAgentName(event.target.value)}
                placeholder={intl.formatMessage({ id: "agents.connect.manual.name.placeholder" })}
              />
            )}
          </Field>

          {requirements && (
            <DetailSection title={intl.formatMessage({ id: "agents.connect.review.auth.label" })}>
              <p className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {intl.formatMessage(
                  { id: "agents.connect.review.auth.requires" },
                  { requirement: requirements },
                )}
              </p>
            </DetailSection>
          )}

          {form.keyName && (
            <DetailSection
              title={intl.formatMessage({
                id:
                  form.authType === "query_param"
                    ? "agents.connect.review.parameterName"
                    : "agents.connect.review.headerName",
              })}
            >
              <p className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                {form.keyName}
              </p>
            </DetailSection>
          )}

          {publisher && (
            <DetailSection title={intl.formatMessage({ id: "agents.connect.review.publisher" })}>
              {publisher.name && <p>{publisher.name}</p>}
              {publisher.site && <p>{publisher.site}</p>}
            </DetailSection>
          )}

          {interfaces.length > 0 && (
            <DetailSection title={intl.formatMessage({ id: "agents.connect.review.interfaces" })}>
              {interfaces.map((item, index) => (
                <div
                  key={`${item.address}-${index}`}
                  className="grid grid-cols-[6.5rem_5rem_1fr] gap-x-4"
                >
                  <span>{item.binding}</span>
                  <span>
                    {item.version &&
                      intl.formatMessage(
                        { id: "agents.connect.review.a2aVersion" },
                        { version: item.version },
                      )}
                  </span>
                  <span className="min-w-0 break-words">{item.address}</span>
                </div>
              ))}
            </DetailSection>
          )}

          {capabilities.length > 0 && (
            <DetailSection title={intl.formatMessage({ id: "agents.connect.review.capabilities" })}>
              {capabilities.map((row) => (
                <Row
                  key={row.key}
                  label={intl.formatMessage({
                    id: `agents.connect.review.capabilities.${row.key}`,
                  })}
                >
                  {yesNo(row.enabled)}
                </Row>
              ))}
            </DetailSection>
          )}

          {(inputModes || outputModes) && (
            <DetailSection title={intl.formatMessage({ id: "agents.connect.review.modes" })}>
              {inputModes && (
                <Row label={intl.formatMessage({ id: "agents.connect.review.modes.input" })}>
                  {inputModes}
                </Row>
              )}
              {outputModes && (
                <Row label={intl.formatMessage({ id: "agents.connect.review.modes.output" })}>
                  {outputModes}
                </Row>
              )}
            </DetailSection>
          )}

          {skills.map((skill, index) => (
            <DetailSection key={`${skill.id ?? skill.name}-${index}`} title={skill.name}>
              {skill.description && <p>{skill.description}</p>}
              {joinModes(skill.inputModes) && (
                <Row label={intl.formatMessage({ id: "agents.connect.review.modes.input" })}>
                  {joinModes(skill.inputModes)}
                </Row>
              )}
              {joinModes(skill.outputModes) && (
                <Row label={intl.formatMessage({ id: "agents.connect.review.modes.output" })}>
                  {joinModes(skill.outputModes)}
                </Row>
              )}
            </DetailSection>
          ))}

          {warnings.length > 0 && (
            <DetailSection title={intl.formatMessage({ id: "agents.connect.review.warnings" })}>
              <ul className="list-disc space-y-1 pl-4">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </DetailSection>
          )}
        </ExpandableSection>

        {form.errors.submit && <SubmitError message={form.errors.submit} />}

        <FormActions
          onCancel={onCancel}
          onContinue={() => void form.continueFromReview()}
          continueLabel={intl.formatMessage({
            id: form.isSubmitting
              ? "agents.connect.auth.submitting"
              : form.requiresAuth
                ? "agents.connect.continue"
                : "agents.connect.auth.submit",
          })}
          isBusy={form.isSubmitting}
        />
      </CardContent>
    </Card>
  );
}
