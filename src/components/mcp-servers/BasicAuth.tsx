import { useIntl } from "react-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface BasicAuthProps {
  username: string;
  password: string; // pragma: allowlist secret
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export function BasicAuth({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
}: BasicAuthProps) {
  const intl = useIntl();

  return (
    <div className="space-y-4">
      <Field
        id="basic-auth-username"
        required
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.basic.usernameLabel" })}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.basic.usernamePlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>

      <Field
        id="basic-auth-password"
        required
        labelProps={{ className: "text-neutral-900 dark:text-neutral-100" }}
        label={intl.formatMessage({ id: "mcpServer.auth.basic.passwordLabel" })}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={intl.formatMessage({ id: "mcpServer.auth.basic.passwordPlaceholder" })}
            className="rounded-md border-neutral-300 px-4 text-sm text-neutral-900 shadow-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 placeholder:text-neutral-400 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        )}
      </Field>
    </div>
  );
}
