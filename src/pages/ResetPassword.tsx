import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { useIntl } from "react-intl";
import { resetPassword, validatePasswordResetToken } from "@/api/passwordReset";
import { classifyPasswordResetError, type PasswordResetError } from "@/api/passwordResetErrors";
import { PasswordInput } from "@/components/users/PasswordInput";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Loading } from "@/components/ui/loading";
import { VALIDATION } from "@/lib/constants";
import { useRouter } from "@/router";

type TokenState =
  "validating" | "valid" | "invalid" | "expired" | "disabled" | "rateLimited" | "failed";

function tokenStateFromError(
  error: PasswordResetError,
): Exclude<TokenState, "validating" | "valid"> {
  if (error.kind === "expired") return "expired";
  if (error.kind === "disabled") return "disabled";
  if (error.kind === "rateLimited") return "rateLimited";
  if (error.kind === "badRequest") return "invalid";
  return "failed";
}

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
        setTokenState(tokenStateFromError(classifyPasswordResetError(err)));
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

    if (password.length < VALIDATION.MIN_PASSWORD_LENGTH) {
      setPasswordError(intl.formatMessage({ id: "auth.resetPassword.error.tooShort" }));
      return;
    }
    const characterTypes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
      pattern.test(password),
    ).length;
    if (characterTypes < 3) {
      setPasswordError(intl.formatMessage({ id: "auth.resetPassword.error.complexity" }));
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
      const resetError = classifyPasswordResetError(err);
      if (resetError.kind === "expired") setTokenState("expired");
      else if (resetError.kind === "disabled") setTokenState("disabled");
      else if (resetError.kind === "rateLimited")
        setSubmitError(intl.formatMessage({ id: "auth.resetPassword.error.rateLimited" }));
      else if (resetError.kind === "badRequest") {
        // Backend uses HTTP 400 for both invalid tokens and password-policy failures.
        // Revalidate instead of inspecting human-readable (and potentially localized) detail.
        try {
          const validation = await validatePasswordResetToken(token);
          if (!validation.valid) setTokenState("invalid");
          else if (resetError.message) setPasswordError(resetError.message);
          else setSubmitError(intl.formatMessage({ id: "auth.resetPassword.error.failed" }));
        } catch (validationError) {
          setTokenState(tokenStateFromError(classifyPasswordResetError(validationError)));
        }
      } else setSubmitError(intl.formatMessage({ id: "auth.resetPassword.error.failed" }));
    } finally {
      setSubmitting(false);
    }
  }

  const tokenErrorMessage = intl.formatMessage({
    id:
      tokenState === "expired"
        ? "auth.resetPassword.error.expired"
        : tokenState === "disabled"
          ? "auth.resetPassword.error.disabled"
          : tokenState === "rateLimited"
            ? "auth.resetPassword.error.rateLimited"
            : tokenState === "failed"
              ? "auth.resetPassword.error.failed"
              : "auth.resetPassword.error.invalid",
  });
  const canRequestNewLink = tokenState === "invalid" || tokenState === "expired";

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 px-4">
      <section
        className={`w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-sm ${
          succeeded ? "max-w-[400px] rounded-xl p-6" : "max-w-sm rounded-lg p-8"
        }`}
        aria-labelledby="reset-password-title"
      >
        {succeeded ? (
          <div className="space-y-6">
            <div role="status" className="space-y-4">
              <h1
                id="reset-password-title"
                ref={successHeadingRef}
                tabIndex={-1}
                className="flex items-center gap-2 text-base font-semibold leading-6 text-neutral-900 dark:text-neutral-100 outline-none"
              >
                <CircleCheck
                  className="size-6 shrink-0 text-emerald-500 dark:text-emerald-400"
                  aria-hidden="true"
                />
                {intl.formatMessage({ id: "auth.resetPassword.successTitle" })}
              </h1>
              <p className="text-[13px] leading-4 text-neutral-500 dark:text-neutral-400">
                {intl.formatMessage({ id: "auth.resetPassword.success" })}
              </p>
            </div>
            <Button
              type="button"
              size="xs"
              className="w-full"
              onClick={() => navigate("/app/login")}
            >
              {intl.formatMessage({ id: "auth.resetPassword.returnToLogin" })}
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
                  onClick={() =>
                    navigate(canRequestNewLink ? "/app/forgot-password" : "/app/login")
                  }
                >
                  {intl.formatMessage({
                    id: canRequestNewLink
                      ? "auth.resetPassword.requestNewLink"
                      : "auth.resetPassword.returnToLogin",
                  })}
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
                    setConfirmPasswordError(null);
                    setSubmitError(null);
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
                    setSubmitError(null);
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
