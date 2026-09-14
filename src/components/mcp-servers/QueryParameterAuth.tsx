import { useIntl } from "react-intl";
import type { ReactNode } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { STATUS_ICON } from "@/lib/status";

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
      {/* Security Warning */}
      <div className="flex items-center gap-3 rounded-md bg-neutral-50 px-3 py-5 dark:bg-neutral-800">
        <STATUS_ICON.warning className="h-5 w-5 shrink-0 text-warning" />
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {intl.formatMessage(
            { id: "mcpServer.auth.query.warning" },
            {
              strong: (chunks: ReactNode) => <span className="font-semibold">{chunks}</span>,
            },
          )}
        </p>
      </div>

      {/* Query parameter name */}
      <Field
        id="query-param-name"
        labelProps={{
          className: "inline-flex items-center gap-0.5 text-neutral-900 dark:text-neutral-100",
        }}
        label={
          <>
            {intl.formatMessage({ id: "mcpServer.auth.query.nameLabel" })}
            <span className="text-destructive">*</span>
            <span className="sr-only">{intl.formatMessage({ id: "mcpServer.form.required" })}</span>
          </>
        }
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

      {/* API key */}
      <Field
        id="query-param-api-key"
        labelProps={{
          className: "inline-flex items-center gap-0.5 text-neutral-900 dark:text-neutral-100",
        }}
        label={
          <>
            {intl.formatMessage({ id: "mcpServer.auth.query.apiKeyLabel" })}
            <span className="text-destructive">*</span>
            <span className="sr-only">{intl.formatMessage({ id: "mcpServer.form.required" })}</span>
          </>
        }
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
