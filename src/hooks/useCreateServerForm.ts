import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useIntl } from "react-intl";
import { z } from "zod";
import type { CreateServerDetails } from "@/components/gateways/types";
import type { Visibility } from "@/types/server";
import { sanitizeString } from "@/lib/sanitize";
import { MAX_TAGS } from "@/utils/tags";

interface CreateServerFormMessages {
  nameRequired: string;
  nameMax: string;
  tagsMax: string;
  descriptionMax: string;
  teamRequired: string;
}

function createServerFormObjectSchema(messages: CreateServerFormMessages) {
  return z.object({
    name: z
      .string()
      .transform((value) => sanitizeString(value, 100))
      .pipe(z.string().min(1, messages.nameRequired).max(100, messages.nameMax)),
    visibility: z.enum(["team", "public", "private"]),
    oauthEnabled: z.boolean(),
    tags: z
      .array(z.string().transform((tag) => sanitizeString(tag, 50)))
      .max(MAX_TAGS, messages.tagsMax),
    description: z
      .string()
      .transform((value) => sanitizeString(value, 500))
      .pipe(z.string().max(500, messages.descriptionMax)),
    teamId: z.string().optional(),
  });
}

function createServerFormSchema(messages: CreateServerFormMessages) {
  return createServerFormObjectSchema(messages).superRefine((data, ctx) => {
    if (data.visibility === "team" && !data.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: messages.teamRequired,
        path: ["teamId"],
      });
    }
  });
}

export type CreateServerFormData = z.infer<ReturnType<typeof createServerFormSchema>>;

interface CreateServerFormValues {
  name: string;
  visibility: Visibility;
  oauthEnabled: boolean;
  tags: string[];
  description: string;
  teamId: string;
}

export interface CreateServerFormInitialValues {
  name?: string;
  visibility?: Visibility;
  oauthEnabled?: boolean;
  tags?: string[];
  description?: string;
  teamId?: string;
}

export interface CreateServerFormErrors {
  name?: string;
  visibility?: string;
  oauthEnabled?: string;
  tags?: string;
  description?: string;
  teamId?: string;
  submit?: string;
}

export interface UseCreateServerFormReturn {
  name: string;
  visibility: Visibility;
  oauthEnabled: boolean;
  tags: string[];
  description: string;
  teamId: string;
  errors: CreateServerFormErrors;
  isValid: boolean;
  setName: (value: string) => void;
  setVisibility: (value: Visibility) => void;
  setOAuthEnabled: (value: boolean) => void;
  setTags: (value: string[]) => void;
  setDescription: (value: string) => void;
  setTeamId: (value: string) => void;
  validateField: (field: keyof CreateServerFormErrors, value: string | boolean | string[]) => void;
  validateForm: () => boolean;
  getFormData: () => CreateServerDetails;
  resetForm: () => void;
  handleSubmit: (
    event: FormEvent<HTMLFormElement>,
    onSuccess?: (details: CreateServerDetails) => void,
  ) => void;
}

const initialState: CreateServerFormValues = {
  name: "",
  visibility: "public",
  oauthEnabled: false,
  tags: [],
  description: "",
  teamId: "",
};

function toFieldErrors(error: z.ZodError): CreateServerFormErrors {
  const nextErrors: CreateServerFormErrors = {};
  error.issues.forEach((issue) => {
    const path = issue.path[0] as keyof CreateServerFormErrors;
    nextErrors[path] = issue.message;
  });
  return nextErrors;
}

function getInitialState(initialValues?: CreateServerFormInitialValues): CreateServerFormValues {
  return {
    name: initialValues?.name ?? initialState.name,
    visibility: initialValues?.visibility ?? initialState.visibility,
    oauthEnabled: initialValues?.oauthEnabled ?? initialState.oauthEnabled,
    tags: initialValues?.tags ?? initialState.tags,
    description: initialValues?.description ?? initialState.description,
    teamId: initialValues?.teamId ?? initialState.teamId,
  };
}

export function useCreateServerForm(
  initialValues?: CreateServerFormInitialValues,
): UseCreateServerFormReturn {
  const intl = useIntl();
  const invalidValueMessage = intl.formatMessage({
    id: "gateways.createServer.validation.invalid",
  });
  const messages = useMemo(
    (): CreateServerFormMessages => ({
      nameRequired: intl.formatMessage({
        id: "gateways.createServer.validation.nameRequired",
      }),
      nameMax: intl.formatMessage({ id: "gateways.createServer.validation.nameMax" }),
      tagsMax: intl.formatMessage({ id: "gateways.createServer.validation.tagsMax" }),
      descriptionMax: intl.formatMessage({
        id: "gateways.createServer.validation.descriptionMax",
      }),
      teamRequired: intl.formatMessage({
        id: "gateways.createServer.validation.teamRequired",
      }),
    }),
    [intl],
  );
  const objectSchema = useMemo(() => createServerFormObjectSchema(messages), [messages]);
  const schema = useMemo(() => createServerFormSchema(messages), [messages]);
  const resolvedInitialState = useMemo(() => getInitialState(initialValues), [initialValues]);
  const [name, setName] = useState(resolvedInitialState.name);
  const [visibility, setVisibility] = useState<Visibility>(resolvedInitialState.visibility);
  const [oauthEnabled, setOAuthEnabled] = useState(resolvedInitialState.oauthEnabled);
  const [tags, setTags] = useState<string[]>(resolvedInitialState.tags);
  const [description, setDescription] = useState(resolvedInitialState.description);
  const [teamId, setTeamId] = useState(resolvedInitialState.teamId);
  const [errors, setErrors] = useState<CreateServerFormErrors>({});

  const getFormValues = useCallback(
    (): CreateServerFormValues => ({
      name,
      visibility,
      oauthEnabled,
      tags,
      description,
      teamId,
    }),
    [name, visibility, oauthEnabled, tags, description, teamId],
  );

  const getFormData = useCallback((): CreateServerDetails => {
    const parsed = schema.parse(getFormValues());
    return {
      name: parsed.name,
      visibility: parsed.visibility,
      oauthEnabled: parsed.oauthEnabled,
      teamId: parsed.teamId || undefined,
      tags: parsed.tags.length > 0 ? parsed.tags : undefined,
      description: parsed.description || undefined,
    };
  }, [getFormValues, schema]);

  const validateField = useCallback(
    (field: keyof CreateServerFormErrors, value: string | boolean | string[]) => {
      if (field === "submit") return;

      try {
        const fieldSchema = objectSchema.shape[field as keyof typeof objectSchema.shape];
        if (!fieldSchema) return;

        fieldSchema.parse(value);
        setErrors((current) => {
          const nextErrors = { ...current };
          delete nextErrors[field];
          return nextErrors;
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          setErrors((current) => ({
            ...current,
            [field]: error.issues[0]?.message || invalidValueMessage,
          }));
        }
      }
    },
    [invalidValueMessage, objectSchema],
  );

  const validateForm = useCallback((): boolean => {
    try {
      schema.parse(getFormValues());
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setErrors(toFieldErrors(error));
      }
      return false;
    }
  }, [getFormValues, schema]);

  const resetForm = useCallback(() => {
    setName(resolvedInitialState.name);
    setVisibility(resolvedInitialState.visibility);
    setOAuthEnabled(resolvedInitialState.oauthEnabled);
    setTags(resolvedInitialState.tags);
    setDescription(resolvedInitialState.description);
    setTeamId(resolvedInitialState.teamId);
    setErrors({});
  }, [resolvedInitialState]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>, onSuccess?: (details: CreateServerDetails) => void) => {
      event.preventDefault();

      if (!validateForm()) return;

      try {
        onSuccess?.(getFormData());
      } catch (error) {
        if (error instanceof z.ZodError) {
          setErrors(toFieldErrors(error));
          return;
        }
      }
    },
    [getFormData, validateForm],
  );

  const isValid = useMemo(() => {
    return schema.safeParse(getFormValues()).success;
  }, [getFormValues, schema]);

  return {
    name,
    visibility,
    oauthEnabled,
    tags,
    description,
    teamId,
    errors,
    isValid,
    setName,
    setVisibility,
    setOAuthEnabled,
    setTags,
    setDescription,
    setTeamId,
    validateField,
    validateForm,
    getFormData,
    resetForm,
    handleSubmit,
  };
}
