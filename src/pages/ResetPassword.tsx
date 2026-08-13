import { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { ApiError } from "@/api/client";
import { resetPassword, validatePasswordResetToken } from "@/api/passwordReset";
import { PasswordInput } from "@/components/users/PasswordInput";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Loading } from "@/components/ui/loading";
import { useRouter } from "@/router";

type TokenState = "validating" | "valid" | "invalid" | "expired" | "disabled";

export function ResetPassword({ token = "" }: { token?: string }) {
  const intl = useIntl();
  const { navigate } = useRouter();
  const [tokenState, setTokenState] = useState<TokenState>("validating");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    if (!token) {
      setTokenState("invalid");
      return () => controller.abort();
    }

    validatePasswordResetToken(token, controller.signal)
      .then((result) => setTokenState(result.valid ? "valid" : "invalid"))
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 410) setTokenState("expired");
        else if (err instanceof ApiError && err.status === 403) setTokenState("disabled");
        else setTokenState("invalid");
      });

    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (succeeded) successHeadingRef.current?.focus();
  }, [succeeded]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setConfirmPasswordError(null);
    setSubmitError(null);

    if (password.length < 8) {
      setPasswordError(intl.formatMessage({ id: "auth.resetPassword.error.tooShort" }));
      return;
    }
    if (password !== confirmPassword) {
      setConfirmPasswordError(intl.formatMessage({ id: "auth.resetPassword.error.mismatch" }));
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password, confirmPassword);
      setPassword("");
      setConfirmPassword("");
      setSucceeded(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setTokenState("expired");
      else if (err instanceof ApiError && err.status === 403) setTokenState("disabled");
      else if (err instanceof ApiError && err.status === 400)
        setSubmitError(intl.formatMessage({ id: "auth.resetPassword.error.invalid" }));
      else setSubmitError(intl.formatMessage({ id: "auth.resetPassword.error.failed" }));
    } finally {
      setSubmitting(false);
    }
  }

  const tokenErrorMessage =
    tokenState === "expired"
      ? intl.formatMessage({ id: "auth.resetPassword.error.expired" })
      : tokenState === "disabled"
        ? intl.formatMessage({ id: "auth.resetPassword.error.disabled" })
        : intl.formatMessage({ id: "auth.resetPassword.error.invalid" });

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 px-4">
      <section
        className="w-full max-w-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-8 shadow-sm"
        aria-labelledby="reset-password-title"
      >
        {succeeded ? (
          <div className="space-y-4">
            <h1
              id="reset-password-title"
              ref={successHeadingRef}
              tabIndex={-1}
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 outline-none"
            >
              {intl.formatMessage({ id: "auth.resetPassword.successTitle" })}
            </h1>
            <InlineNotification
              type="success"
              message={intl.formatMessage({ id: "auth.resetPassword.success" })}
            />
            <Button type="button" className="w-full" onClick={() => navigate("/app/login")}>
              {intl.formatMessage({ id: "auth.forgotPassword.backToLogin" })}
            </Button>
          </div>
        ) : (
          <>
            <h1
              id="reset-password-title"
              className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {intl.formatMessage({ id: "auth.resetPassword.title" })}
            </h1>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {intl.formatMessage({ id: "auth.resetPassword.description" })}
            </p>

            {tokenState === "validating" ? (
              <div className="mt-6">
                <Loading variant="inline" />
              </div>
            ) : tokenState !== "valid" ? (
              <div className="mt-6 space-y-4">
                <InlineNotification type="error" message={tokenErrorMessage} />
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => navigate("/app/forgot-password")}
                >
                  {intl.formatMessage({ id: "auth.resetPassword.requestNewLink" })}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <PasswordInput
                  id="new-password"
                  value={password}
                  onChange={(value) => {
                    setPassword(value);
                    setPasswordError(null);
                  }}
                  label={intl.formatMessage({ id: "auth.resetPassword.password" })}
                  placeholder={intl.formatMessage({ id: "auth.resetPassword.password" })}
                  required
                  hint={intl.formatMessage({ id: "auth.resetPassword.passwordHint" })}
                  error={passwordError ?? undefined}
                />
                <PasswordInput
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(value) => {
                    setConfirmPassword(value);
                    setConfirmPasswordError(null);
                  }}
                  label={intl.formatMessage({ id: "auth.resetPassword.confirmPassword" })}
                  placeholder={intl.formatMessage({ id: "auth.resetPassword.confirmPassword" })}
                  required
                  error={confirmPasswordError ?? undefined}
                />
                {submitError && <InlineNotification type="error" message={submitError} />}
                <Button
                  type="submit"
                  disabled={submitting || !password || !confirmPassword}
                  className="w-full"
                >
                  {submitting
                    ? intl.formatMessage({ id: "auth.resetPassword.submitting" })
                    : intl.formatMessage({ id: "auth.resetPassword.submit" })}
                </Button>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
