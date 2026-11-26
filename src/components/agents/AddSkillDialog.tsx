import { useState } from "react";
import type { FormEvent } from "react";
import { useIntl } from "react-intl";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { AgentIcon } from "@/components/icons/AgentIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import {
  SKILL_LIMITS,
  buildSkill,
  validateSkillDraft,
  type AgentSkill,
  type AgentSkillEntry,
  type SkillDraftErrors,
} from "./agentSkills";

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The skills the agent has, to catch an id that is taken. */
  existingSkills: readonly AgentSkillEntry[];
  /** Saves the skill; rejects if saving fails, which keeps the dialog open. */
  onSubmit: (skill: AgentSkill) => Promise<void>;
}

/** The form for one new skill. Its id comes from the name, so it is not asked for. */
// Same focus look as the Tags input: the border stays, with a thin ring.
const FIELD_CLASS =
  "border-neutral-300 shadow-none focus-visible:border-neutral-300 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700 dark:focus-visible:border-neutral-700";

export function AddSkillDialog({
  open,
  onOpenChange,
  existingSkills,
  onSubmit,
}: AddSkillDialogProps) {
  const intl = useIntl();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [examples, setExamples] = useState<string[]>([""]);
  const [errors, setErrors] = useState<SkillDraftErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setTags([]);
    setExamples([""]);
    setErrors({});
    setSubmitted(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const check = (draft = { name, description, tags, examples }) =>
    validateSkillDraft(draft, existingSkills);
  const message = (code?: string) =>
    code ? intl.formatMessage({ id: `agents.skills.add.error.${code}` }) : undefined;

  // After a first attempt, errors follow the input so a fixed field clears at once.
  const live = submitted ? check() : errors;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSubmit(buildSkill({ name, description, tags, examples }));
      reset();
      onOpenChange(false);
    } catch {
      // The caller has reported why; the form stays for another try.
    } finally {
      setSaving(false);
    }
  };

  const setExample = (index: number, value: string) =>
    setExamples((prev) => prev.map((current, i) => (i === index ? value : current)));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[32rem]" aria-describedby={undefined}>
        <form onSubmit={handleSubmit} noValidate className="grid gap-5">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-agent-icon-bg">
              <AgentIcon className="h-3.5 w-3.5 text-black" aria-hidden="true" />
            </div>
            <DialogTitle className="text-sm font-medium leading-none">
              {intl.formatMessage({ id: "agents.skills.add.title" })}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {intl.formatMessage({ id: "agents.skills.add.description" })}
          </DialogDescription>

          <Field
            id="add-skill-name"
            label={intl.formatMessage({ id: "agents.skills.add.name" })}
            required
            error={message(live.name)}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                autoComplete="off"
                className={FIELD_CLASS}
              />
            )}
          </Field>

          <Field
            id="add-skill-description"
            label={intl.formatMessage({ id: "agents.skills.add.descriptionLabel" })}
            required
            error={message(live.description)}
          >
            {(controlProps) => (
              <Textarea
                {...controlProps}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={cn("min-h-12", FIELD_CLASS)}
              />
            )}
          </Field>

          <Field
            id="add-skill-tags"
            label={intl.formatMessage({ id: "agents.skills.add.tags" })}
            required
            error={message(live.tags)}
          >
            {(controlProps) => (
              <TagInput
                {...controlProps}
                value={tags}
                onChange={setTags}
                maxTags={SKILL_LIMITS.tags}
                placeholder={intl.formatMessage({ id: "agents.skills.add.tags.placeholder" })}
              />
            )}
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium leading-none">
              {intl.formatMessage({ id: "agents.skills.add.examples" })}
            </legend>
            {examples.map((example, index) => {
              const last = index === examples.length - 1;
              return (
                <div key={index} className="flex items-center gap-3">
                  <Textarea
                    value={example}
                    onChange={(event) => setExample(index, event.target.value)}
                    aria-label={intl.formatMessage(
                      { id: "agents.skills.add.example.label" },
                      { index: index + 1 },
                    )}
                    placeholder={intl.formatMessage({
                      id: "agents.skills.add.examples.placeholder",
                    })}
                    className={cn("min-h-9 flex-1", FIELD_CLASS)}
                    rows={1}
                  />
                  {/* A fixed-width column keeps every textarea the same width: Remove on all but the last row, Add on the last. */}
                  <div className="flex w-20 flex-shrink-0 justify-start">
                    {last ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setExamples((prev) => [...prev, ""])}
                      >
                        <Plus aria-hidden="true" />
                        {intl.formatMessage({ id: "agents.skills.add.example.add" })}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-destructive"
                        onClick={() => setExamples((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 aria-hidden="true" />
                        {intl.formatMessage({ id: "agents.skills.add.example.remove" })}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {message(live.examples) && (
              <p role="alert" className="text-xs text-destructive">
                {message(live.examples)}
              </p>
            )}
          </fieldset>

          {message(live.form) && (
            <p role="alert" className="text-xs text-destructive">
              {message(live.form)}
            </p>
          )}

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handleOpenChange(false)}
            >
              {intl.formatMessage({ id: "common.button.cancel" })}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {intl.formatMessage({ id: "agents.skills.add.submit" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
