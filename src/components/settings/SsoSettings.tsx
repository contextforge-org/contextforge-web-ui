import { useIntl } from "react-intl";
import { useAuthContext } from "@/auth/AuthContext";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SsoSettings() {
  const intl = useIntl();
  const { ssoEnabled, ssoProviderName } = useAuthContext();

  return (
    <div className="max-w-md space-y-6">
      <Field id="sso-status" label={intl.formatMessage({ id: "settings.sso.statusLabel" })}>
        {(controlProps) => (
          <Input
            {...controlProps}
            // Settings.tsx only mounts this tab when ssoEnabled is true; the disabled branch is defensive/test-only.
            value={intl.formatMessage({
              id: ssoEnabled ? "settings.sso.statusEnabled" : "settings.sso.statusDisabled",
            })}
            readOnly
            className="bg-muted text-muted-foreground"
          />
        )}
      </Field>
      {ssoEnabled && ssoProviderName && (
        <Field id="sso-provider" label={intl.formatMessage({ id: "settings.sso.providerLabel" })}>
          {(controlProps) => (
            <Input
              {...controlProps}
              value={ssoProviderName}
              readOnly
              className="bg-muted text-muted-foreground"
            />
          )}
        </Field>
      )}
      <p className="text-sm text-muted-foreground">
        {intl.formatMessage({ id: "settings.sso.hint" })}
      </p>
    </div>
  );
}
