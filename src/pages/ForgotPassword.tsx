import { useState } from "react";
import { useIntl } from "react-intl";
import { requestPasswordReset } from "@/api/passwordReset";
import { classifyPasswordResetError } from "@/api/passwordResetErrors";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/router";

export function ForgotPassword() {
  const intl = useIntl();
  const { navigate } = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEmailError(null);

    if (!event.currentTarget.checkValidity()) {
      setEmailError(intl.formatMessage({ id: "auth.forgotPassword.error.invalidEmail" }));
      return;
    }

    setLoading(true);

    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (err) {
      const resetError = classifyPasswordResetError(err);
      if (resetError.kind === "rateLimited") {
        setError(intl.formatMessage({ id: "auth.forgotPassword.error.rateLimited" }));
      } else if (resetError.kind === "disabled") {
        setError(intl.formatMessage({ id: "auth.forgotPassword.error.disabled" }));
      } else {
        setError(intl.formatMessage({ id: "auth.forgotPassword.error.failed" }));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard titleId="forgot-password-title">
      <h1
        id="forgot-password-title"
        className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
      >
        {intl.formatMessage({ id: "auth.forgotPassword.title" })}
      </h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {intl.formatMessage({ id: "auth.forgotPassword.description" })}
      </p>

      {submitted ? (
        <div className="mt-6 space-y-4">
          <InlineNotification
            type="success"
            message={intl.formatMessage({ id: "auth.forgotPassword.success" })}
          />
          <Button type="button" className="w-full" onClick={() => navigate("/app/login")}>
            {intl.formatMessage({ id: "auth.forgotPassword.backToLogin" })}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-1">
            <Label htmlFor="email">{intl.formatMessage({ id: "auth.forgotPassword.email" })}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "forgot-password-email-error" : undefined}
            />
            {emailError && (
              <p
                id="forgot-password-email-error"
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {emailError}
              </p>
            )}
          </div>
          {error && <InlineNotification type="error" message={error} />}
          <Button type="submit" disabled={loading || !email.trim()} className="w-full">
            {loading
              ? intl.formatMessage({ id: "auth.forgotPassword.submitting" })
              : intl.formatMessage({ id: "auth.forgotPassword.submit" })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => navigate("/app/login")}
          >
            {intl.formatMessage({ id: "auth.forgotPassword.backToLogin" })}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
