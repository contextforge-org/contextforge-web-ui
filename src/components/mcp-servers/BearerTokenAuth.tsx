import { useIntl } from "react-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface BearerTokenAuthProps {
  token: string;
  onTokenChange: (value: string) => void;
}

export function BearerTokenAuth({ token, onTokenChange }: BearerTokenAuthProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4">
      <Field
        id="bearer-token"
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.bearer.label" })}
      >
        {(controlProps) => (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {intl.formatMessage({ id: "mcpServer.auth.bearer.description" })}
            </p>
            <Input
              {...controlProps}
              type="password"
              value={token}
              onChange={(e) => onTokenChange(e.target.value)}
              placeholder={intl.formatMessage({ id: "mcpServer.auth.bearer.placeholder" })}
              className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
            />
          </>
        )}
      </Field>
    </div>
  );
}
