import { useIntl } from "react-intl";
import { Field } from "@/components/ui/field";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { useTagSuggestions } from "@/hooks/useTagSuggestions";
import { MAX_TAGS } from "@/utils/tags";

interface TagsAndDescriptionFieldsProps {
  /** Distinguishes the ids when more than one set is on a page. */
  idPrefix: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
}

/** The two optional extras every way of connecting an agent offers. */
export function TagsAndDescriptionFields({
  idPrefix,
  tags,
  onTagsChange,
  description,
  onDescriptionChange,
}: TagsAndDescriptionFieldsProps) {
  const intl = useIntl();
  const tagSuggestions = useTagSuggestions();
  return (
    <div className="space-y-4">
      <Field
        id={`${idPrefix}-tags`}
        label={intl.formatMessage({ id: "agents.connect.manual.tags.label" })}
      >
        {(controlProps) => (
          <TagInput
            {...controlProps}
            value={tags}
            onChange={onTagsChange}
            suggestions={tagSuggestions}
            maxTags={MAX_TAGS}
            placeholder={intl.formatMessage({ id: "common.tagInput.placeholder" })}
          />
        )}
      </Field>

      {/* The design shows the description without a visible label; keep one for screen readers. */}
      <Field
        id={`${idPrefix}-description`}
        label={intl.formatMessage({ id: "agents.connect.manual.description.label" })}
        labelProps={{ className: "sr-only" }}
      >
        {(controlProps) => (
          <Textarea
            {...controlProps}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={intl.formatMessage({
              id: "agents.connect.manual.description.placeholder",
            })}
            className="min-h-20 rounded-md border-neutral-300 px-4 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 dark:border-neutral-700"
          />
        )}
      </Field>
    </div>
  );
}
