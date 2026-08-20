import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { z } from "zod";
import { useAuthContext } from "@/auth/AuthContext";
import { useQuery } from "@/hooks/useQuery";
import { resolveTeamId, useTeams } from "@/hooks/useTeams";
import { promptsApi } from "@/api/prompts";
import { parseApiError } from "@/lib/errorUtils";
import { sanitizeString } from "@/lib/sanitize";
import type {
  BodyCreatePromptV1PromptsPost,
  PromptArgument,
  PromptRead,
  PromptUpdate,
} from "@/generated/types";
import type { PromptFormErrors } from "@/types/prompts";
import type { Visibility } from "@/types/server";
import type { Team } from "@/types/team";

interface PromptFormValues {
  name: string;
  visibility: Visibility;
  template: string;
  arguments: string;
  description: string;
  tags: string[];
  teamId?: string;
}

export interface PromptFormInitialValues {
  name?: string;
  visibility?: Visibility;
  template?: string;
  arguments?: string;
  description?: string;
  tags?: string[];
  /**
   * The prompt's existing team (edit mode). When set, a `team`-visibility edit
   * keeps this team instead of resolving a default, so editing a team prompt
   * never silently reassigns it.
   */
  teamId?: string | null;
}

export interface UsePromptFormOptions {
  /** When set, the form updates this prompt (`PUT /prompts/{id}`) instead of creating one. */
  promptId?: string;
  /** Values to prefill the form with (edit mode). */
  initialValues?: PromptFormInitialValues;
  /**
   * Whether this is a federated prompt (sourced from a remote MCP gateway).
   * Federated prompts have no local template (so it is not required) and their
   * description/template/arguments are managed upstream — those fields are
   * omitted from the update payload so an edit never clobbers newer upstream
   * data with stale, prefilled form state.
   */
  federated?: boolean;
}

// The generated `prompt` field is nullable to match the server's Optional
// schema; the form always constructs a real object, so narrow it locally.
type CreatePromptPayload = Omit<BodyCreatePromptV1PromptsPost, "prompt"> & {
  prompt: NonNullable<BodyCreatePromptV1PromptsPost["prompt"]>;
};

export interface UsePromptFormReturn {
  name: string;
  visibility: Visibility;
  teamId?: string;
  /** Teams the caller belongs to, for the in-form selector. */
  teams: Team[];
  template: string;
  arguments: string;
  description: string;
  tags: string[];
  errors: PromptFormErrors;
  isValid: boolean;
  isSubmitting: boolean;
  setName: (value: string) => void;
  setVisibility: (value: Visibility) => void;
  setTeamId: (value: string) => void;
  setTemplate: (value: string) => void;
  setArguments: (value: string) => void;
  setDescription: (value: string) => void;
  setTags: (value: string[]) => void;
  validateField: (field: keyof PromptFormErrors, value: string) => void;
  validateForm: () => boolean;
  resetForm: () => void;
  getFormData: () => CreatePromptPayload;
  handleSubmit: (event: FormEvent<HTMLFormElement>, onSuccess?: () => void) => Promise<void>;
}

const initialState: PromptFormValues = {
  name: "",
  visibility: "public",
  template: "",
  arguments: "",
  description: "",
  tags: [],
};

const createPromptFormSchema = (intl: ReturnType<typeof useIntl>, templateRequired: boolean) =>
  z
    .object({
      name: z
        .string()
        .transform((value) => sanitizeString(value, 100))
        .pipe(z.string().min(1, intl.formatMessage({ id: "prompts.add.error.nameRequired" }))),
      visibility: z.enum(["public", "private", "team"]),
      // Local (REST) prompts carry their content in `template`, so it is
      // required. Federated prompts have no local template — the upstream MCP
      // server resolves the content on `prompts/get` — so the field is optional
      // when editing them.
      template: templateRequired
        ? z.string().min(1, intl.formatMessage({ id: "prompts.add.error.templateRequired" }))
        : z.string(),
      arguments: z.string().transform((value, ctx): PromptArgument[] => {
        if (!value.trim()) return [];

        try {
          const parsedArguments = JSON.parse(value) as unknown;
          if (!Array.isArray(parsedArguments)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: intl.formatMessage({ id: "prompts.add.error.argumentsArrayRequired" }),
            });
            return z.NEVER;
          }
          return parsedArguments as PromptArgument[];
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: intl.formatMessage({ id: "prompts.add.error.argumentsInvalidJson" }),
          });
          return z.NEVER;
        }
      }),
      description: z
        .string()
        .transform((value) => sanitizeString(value, 500))
        .optional(),
      tags: z.array(z.string().transform((t) => sanitizeString(t, 200))).optional(),
      teamId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.visibility === "team" && !data.teamId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: intl.formatMessage({ id: "prompts.add.error.teamRequired" }),
          path: ["teamId"],
        });
      }
    })
    .transform((data): CreatePromptPayload => {
      const teamId = data.visibility === "team" && data.teamId ? data.teamId : null;

      return {
        prompt: {
          name: data.name,
          description: data.description || undefined,
          template: data.template,
          arguments: data.arguments,
          tags: data.tags,
          visibility: data.visibility,
          teamId,
        },
        team_id: teamId,
        visibility: data.visibility,
      };
    });

function toFieldErrors(error: z.ZodError): PromptFormErrors {
  const nextErrors: PromptFormErrors = {};
  error.issues.forEach((issue) => {
    const path = issue.path[0] as keyof PromptFormErrors;
    nextErrors[path] = issue.message;
  });
  return nextErrors;
}

function getApiFieldError(error: unknown): PromptFormErrors | null {
  if (!error || typeof error !== "object" || !("body" in error)) return null;

  const body = (error as { body?: { field?: string; message?: string } | null }).body;
  if (!body?.field || !body.message) return null;

  const field = body.field === "team_id" ? "teamId" : body.field;
  if (
    field === "name" ||
    field === "visibility" ||
    field === "teamId" ||
    field === "template" ||
    field === "arguments"
  ) {
    return { [field]: body.message };
  }

  return null;
}

export function usePromptForm(options: UsePromptFormOptions = {}): UsePromptFormReturn {
  const { promptId, initialValues, federated = false } = options;
  const intl = useIntl();
  const { selectedTeamId } = useAuthContext();
  // Federated prompts have no local template, so it isn't required.
  const templateRequired = !federated;
  const schema = useMemo(
    () => createPromptFormSchema(intl, templateRequired),
    [intl, templateRequired],
  );

  const [name, setNameState] = useState(initialValues?.name ?? initialState.name);
  const [visibility, setVisibilityState] = useState<Visibility>(
    initialValues?.visibility ?? initialState.visibility,
  );
  const [template, setTemplateState] = useState(initialValues?.template ?? initialState.template);
  const [argumentsValue, setArgumentsState] = useState(
    initialValues?.arguments ?? initialState.arguments,
  );
  const [description, setDescriptionState] = useState(
    initialValues?.description ?? initialState.description,
  );
  const [tags, setTagsState] = useState<string[]>(initialValues?.tags ?? initialState.tags);
  const [errors, setErrors] = useState<PromptFormErrors>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const { teams } = useTeams();
  // The prompt's own team in edit mode, or the caller's in-form choice; either
  // one wins over the resolved default so an edit never reassigns the prompt.
  const [chosenTeamId, setChosenTeamId] = useState(initialValues?.teamId ?? undefined);
  const teamId =
    visibility === "team" ? resolveTeamId(teams, selectedTeamId, chosenTeamId) : undefined;
  const { execute: createPrompt, isLoading: isCreating } = useQuery<
    PromptRead,
    CreatePromptPayload
  >("/prompts", {
    method: "POST",
    enabled: false,
  });

  const isSubmitting = isCreating || isUpdating;

  const getFormValues = useCallback(
    (): PromptFormValues => ({
      name,
      visibility,
      template,
      arguments: argumentsValue,
      description,
      tags,
      teamId,
    }),
    [name, visibility, template, argumentsValue, description, tags, teamId],
  );

  const validateField = useCallback(
    (field: keyof PromptFormErrors, value: string) => {
      if (field === "submit") return;

      const nextValues = {
        ...getFormValues(),
        [field]: value,
      };

      if (field === "visibility") {
        nextValues.teamId =
          value === "team" ? resolveTeamId(teams, selectedTeamId, chosenTeamId) : undefined;
      }

      const result = schema.safeParse({
        ...nextValues,
      });

      if (result.success) {
        setErrors((current) => {
          const nextErrors = { ...current };
          delete nextErrors[field];
          return nextErrors;
        });
        return;
      }

      const fieldIssue = result.error.issues.find((issue) => issue.path[0] === field);
      setErrors((current) => {
        const nextErrors = { ...current };
        if (fieldIssue) {
          nextErrors[field] = fieldIssue.message;
        } else {
          delete nextErrors[field];
        }
        return nextErrors;
      });
    },
    [getFormValues, schema, selectedTeamId, teams, chosenTeamId],
  );

  const updateField = useCallback(
    (
      field: keyof PromptFormErrors,
      value: string,
      setter: (nextValue: string) => void,
      validateImmediately = false,
    ) => {
      setter(value);
      setErrors((current) => {
        if (!current.submit) return current;
        const nextErrors = { ...current };
        delete nextErrors.submit;
        return nextErrors;
      });

      if (validateImmediately || errors[field]) {
        validateField(field, value);
      }
    },
    [errors, validateField],
  );

  const setName = useCallback(
    (value: string) => updateField("name", value, setNameState),
    [updateField],
  );
  const setVisibility = useCallback((value: Visibility) => {
    setVisibilityState(value);
    setErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors.submit;
      delete nextErrors.visibility;
      // Choosing "team" is not itself a mistake — the team requirement is
      // raised on submit, never as a reaction to picking the level.
      delete nextErrors.teamId;
      return nextErrors;
    });
  }, []);
  const setTeamId = useCallback((value: string) => {
    setChosenTeamId(value || undefined);
    setErrors((current) => {
      if (!current.submit && !current.teamId) return current;
      const nextErrors = { ...current };
      delete nextErrors.submit;
      if (value) delete nextErrors.teamId;
      return nextErrors;
    });
  }, []);
  const setTemplate = useCallback(
    (value: string) => updateField("template", value, setTemplateState),
    [updateField],
  );
  const setArguments = useCallback(
    (value: string) => updateField("arguments", value, setArgumentsState),
    [updateField],
  );
  const setDescription = useCallback(
    (value: string) => updateField("description", value, setDescriptionState),
    [updateField],
  );
  const setTags = useCallback((value: string[]) => {
    setTagsState(value);
    setErrors((current) => {
      if (!current.submit) return current;
      const nextErrors = { ...current };
      delete nextErrors.submit;
      return nextErrors;
    });
  }, []);

  const validateForm = useCallback((): boolean => {
    const result = schema.safeParse(getFormValues());
    if (result.success) {
      setErrors({});
      return true;
    }

    setErrors(toFieldErrors(result.error));
    return false;
  }, [getFormValues, schema]);

  const resetForm = useCallback(() => {
    setNameState(initialState.name);
    setVisibilityState(initialState.visibility);
    setTemplateState(initialState.template);
    setArgumentsState(initialState.arguments);
    setDescriptionState(initialState.description);
    setTagsState(initialState.tags);
    setChosenTeamId(undefined);
    setErrors({});
  }, []);

  const getFormData = useCallback(
    (): CreatePromptPayload => schema.parse(getFormValues()),
    [getFormValues, schema],
  );

  const getUpdateData = useCallback((): NonNullable<PromptUpdate> => {
    const { prompt } = schema.parse(getFormValues());
    const payload: NonNullable<PromptUpdate> = {
      name: prompt.name,
      tags: prompt.tags ?? undefined,
      teamId: prompt.teamId,
      visibility: prompt.visibility,
    };

    // Federated prompts have their description/template/arguments managed
    // upstream. Omit them entirely so a name/visibility/tag edit never
    // overwrites newer upstream data with stale, prefilled form values (the
    // inputs are read-only in the form, but their values would still be sent).
    if (!federated) {
      // Send "" (not null) for an emptied description so the backend actually
      // clears it — the update service treats null as "field not provided" and
      // leaves the previous value in place.
      payload.description = prompt.description ?? "";
      payload.template = prompt.template;
      payload.arguments = prompt.arguments;
    }

    return payload;
  }, [federated, getFormValues, schema]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>, onSuccess?: () => void) => {
      event.preventDefault();
      if (!validateForm()) return;

      try {
        if (promptId) {
          setIsUpdating(true);
          try {
            await promptsApi.update(promptId, getUpdateData());
          } finally {
            setIsUpdating(false);
          }
        } else {
          await createPrompt(getFormData());
          resetForm();
        }
        setErrors({});
        onSuccess?.();
      } catch (error) {
        const fieldError = getApiFieldError(error);
        if (fieldError) {
          setErrors(fieldError);
        } else {
          setErrors({
            submit: parseApiError(
              error,
              intl.formatMessage({ id: promptId ? "prompts.edit.error" : "prompts.add.error" }),
            ),
          });
        }
      }
    },
    [createPrompt, getFormData, getUpdateData, intl, promptId, resetForm, validateForm],
  );

  const isValid = useMemo(() => schema.safeParse(getFormValues()).success, [getFormValues, schema]);

  return {
    name,
    visibility,
    teamId,
    teams,
    template,
    arguments: argumentsValue,
    description,
    tags,
    errors,
    isValid,
    isSubmitting,
    setName,
    setVisibility,
    setTeamId,
    setTemplate,
    setArguments,
    setDescription,
    setTags,
    validateField,
    validateForm,
    resetForm,
    getFormData,
    handleSubmit,
  };
}
