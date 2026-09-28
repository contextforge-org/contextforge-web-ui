import { useState, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { ChevronRight, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateServerForm,
  type CreateServerFormInitialValues,
} from "@/hooks/useCreateServerForm";
import { useTagSuggestions } from "@/hooks/useTagSuggestions";
import { MAX_TAGS } from "@/utils/tags";
import type { CreateServerDetails } from "@/components/gateways/types";
import type { Visibility } from "@/types/server";
import { VisibilityInfoPopover } from "@/components/common/VisibilityInfoPopover";
import { STATUS_ICON } from "@/lib/status";

const visibilityOptions: Array<{
  value: Visibility;
  labelId: string;
}> = [
  {
    value: "public",
    labelId: "common.visibility.internal",
  },
  {
    value: "team",
    labelId: "common.visibility.team",
  },
  {
    value: "private",
    labelId: "common.visibility.private",
  },
];

export function CreateServerForm({
  initialValues,
  onCancel,
  onSuccess,
  title,
  description: formDescription,
  submitLabel,
  isSubmitting = false,
  submitError,
  children,
}: {
  initialValues?: CreateServerFormInitialValues;
  onCancel: () => void;
  onSuccess: (details: CreateServerDetails) => void;
  title?: string;
  description?: string;
  submitLabel?: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  children?: ReactNode;
}) {
  const intl = useIntl();
  const [optionalOpen, setOptionalOpen] = useState(
    Boolean(initialValues?.tags?.length || initialValues?.description),
  );
  const {
    name,
    visibility,
    oauthEnabled,
    tags,
    description,
    errors,
    setName,
    setVisibility,
    setOAuthEnabled,
    setTags,
    setDescription,
    validateField,
    handleSubmit,
  } = useCreateServerForm(initialValues);
  const tagSuggestions = useTagSuggestions();
  const resolvedTitle = title ?? intl.formatMessage({ id: "gateways.createServer.title" });
  const resolvedDescription =
    formDescription ?? intl.formatMessage({ id: "gateways.createServer.description" });
  const resolvedSubmitLabel =
    submitLabel ?? intl.formatMessage({ id: "gateways.createServer.continue" });
  const displayedSubmitError = submitError ?? errors.submit;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    handleSubmit(event, onSuccess);
  };

  return (
    <form
      className="rounded-xl border border-border bg-card px-7 py-7 shadow-xs dark:border-[#2b2b2f] dark:bg-[#141414]"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#f554ff] text-black">
          <Server className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{resolvedTitle}</h1>
      </div>

      <div className="mt-5">
        <p className="max-w-[48rem] text-sm leading-5 text-muted-foreground">
          {resolvedDescription}
        </p>
      </div>

      {displayedSubmitError && (
        <div
          className="mt-6 flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <STATUS_ICON.error className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{displayedSubmitError}</p>
        </div>
      )}

      <div className="mt-12 grid gap-7">
        <fieldset className="space-y-3">
          <legend className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {intl.formatMessage({ id: "gateways.createServer.visibility" })}
            <VisibilityInfoPopover />
          </legend>
          <div
            className="grid h-10 grid-cols-3 rounded-md bg-muted p-1"
            role="radiogroup"
            aria-label={intl.formatMessage({ id: "gateways.createServer.visibility" })}
          >
            {visibilityOptions.map((option) => {
              const selected = visibility === option.value;
              return (
                <div key={option.value} className="min-w-0">
                  <input
                    type="radio"
                    id={`server-visibility-${option.value}`}
                    name="visibility"
                    value={option.value}
                    checked={selected}
                    onChange={(event) => {
                      const nextVisibility = event.target.value as Visibility;
                      setVisibility(nextVisibility);
                      validateField("visibility", nextVisibility);
                    }}
                    className="sr-only peer"
                  />
                  <label
                    htmlFor={`server-visibility-${option.value}`}
                    className="flex h-full cursor-pointer items-center justify-center rounded-sm px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-xs peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background"
                  >
                    {intl.formatMessage({ id: option.labelId })}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <Field
          id="server-name"
          required
          error={errors.name}
          label={intl.formatMessage({ id: "gateways.createServer.name" })}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) validateField("name", event.target.value);
              }}
              onBlur={(event) => validateField("name", event.target.value)}
              placeholder={intl.formatMessage({ id: "gateways.createServer.namePlaceholder" })}
              maxLength={100}
              className="h-10 rounded-md border-input bg-background px-3 text-sm shadow-none"
            />
          )}
        </Field>

        <Field
          id="oauth-enabled"
          label={intl.formatMessage({ id: "gateways.createServer.oauthLabel" })}
        >
          {(controlProps) => (
            <div className="flex items-center gap-4">
              <Switch
                {...controlProps}
                checked={oauthEnabled}
                onCheckedChange={(checked) => {
                  setOAuthEnabled(checked);
                  validateField("oauthEnabled", checked);
                }}
                aria-describedby="oauth-enabled-description"
                className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-[#343438]"
              />
              <p id="oauth-enabled-description" className="text-sm leading-5 text-muted-foreground">
                {intl.formatMessage({ id: "gateways.createServer.oauthDescription" })}
              </p>
            </div>
          )}
        </Field>

        <Button
          type="button"
          variant="ghost"
          onClick={() => setOptionalOpen((current) => !current)}
          className="flex h-12 w-full items-center gap-3 rounded-md border border-border px-4 text-left text-sm font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground dark:border-[#252529]"
          aria-expanded={optionalOpen}
          aria-controls="optional-server-configuration"
        >
          <ChevronRight
            className={`size-4 transition ${optionalOpen ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
          {intl.formatMessage({ id: "gateways.createServer.optionalConfiguration" })}
        </Button>

        {optionalOpen && (
          <div id="optional-server-configuration" className="grid gap-7">
            <Field
              id="server-tags"
              error={errors.tags}
              label={intl.formatMessage({ id: "gateways.createServer.tags" })}
            >
              {(controlProps) => (
                <TagInput
                  {...controlProps}
                  value={tags}
                  onChange={(next) => {
                    setTags(next);
                    if (errors.tags) validateField("tags", next);
                  }}
                  suggestions={tagSuggestions}
                  maxTags={MAX_TAGS}
                  placeholder={intl.formatMessage({
                    id: "gateways.createServer.tagsPlaceholder",
                  })}
                />
              )}
            </Field>

            <Field
              id="server-description"
              error={errors.description}
              label={intl.formatMessage({ id: "gateways.createServer.descriptionLabel" })}
            >
              {(controlProps) => (
                <Textarea
                  {...controlProps}
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    if (errors.description) validateField("description", event.target.value);
                  }}
                  onBlur={(event) => validateField("description", event.target.value)}
                  placeholder={intl.formatMessage({
                    id: "gateways.createServer.descriptionPlaceholder",
                  })}
                  maxLength={500}
                  className="rounded-md border-border bg-background px-3 py-3 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-offset-0 dark:border-[#55555c] dark:bg-[#141414]"
                />
              )}
            </Field>
          </div>
        )}
      </div>

      {children && <div className="mt-7">{children}</div>}

      <div className="mt-8 flex items-center justify-end gap-5">
        <Button type="button" variant="ghost" onClick={onCancel} className="h-8 px-2 text-sm">
          {intl.formatMessage({ id: "common.button.cancel" })}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-8 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-white/90"
        >
          {resolvedSubmitLabel}
        </Button>
      </div>
    </form>
  );
}
