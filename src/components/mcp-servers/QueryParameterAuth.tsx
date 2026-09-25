import { useIntl } from "react-intl";
import type { ReactNode } from "react";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface QueryParameterAuthProps {
  parameterName: string;
  apiKey: string;
  onParameterNameChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
}

export function QueryParameterAuth({
  parameterName,
  apiKey,
  onParameterNameChange,
  onApiKeyChange,
}: QueryParameterAuthProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4">
      <Callout severity="warning">
        {intl.formatMessage(
          { id: "mcpServer.auth.query.warning" },
          {
            strong: (chunks: ReactNode) => <span className="font-semibold">{chunks}</span>,
          },
        )}
      </Callout>

      <Field
        id="query-param-name"
        required
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.query.nameLabel" })}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="text"
            value={parameterName}
            onChange={(e) => onParameterNameChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.query.namePlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>

      <Field
        id="query-param-api-key"
        required
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.query.apiKeyLabel" })}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.query.apiKeyPlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>
    </div>
  );
}
