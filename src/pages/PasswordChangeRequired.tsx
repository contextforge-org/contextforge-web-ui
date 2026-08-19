import { useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { useAuth } from "@/auth/useAuth";
import { classifyChangePasswordRequiredError } from "@/api/changePasswordRequiredErrors";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthSuccessPanel } from "@/components/auth/AuthSuccessPanel";
import { PasswordInput } from "@/components/users/PasswordInput";
import { Button } from "@/components/ui/button";
import { InlineNotification } from "@/components/ui/inline-notification";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VALIDATION } from "@/lib/constants";
import {
  countPasswordCharacterClasses,
  MIN_PASSWORD_CHARACTER_CLASSES,
} from "@/lib/passwordPolicy";
import { useRouter, resolveNextParam } from "@/router";

/**
 * Public, pre-auth screen the user lands on after Login.tsx detects a
 * "password change required" 403 (see classifyLoginError). Distinct from the
 * private, authenticated self-service /app/change-password stub — this page
 * re-authenticates with the old password, changes it, then logs in again
 * with the new password via AuthContext.completePasswordChangeRequired,
 * which lands the user in a real session exactly like a normal login.
 */
export function PasswordChangeRequired() {
  const intl = useIntl();
  const { isAuthenticated, completePasswordChangeRequired } = useAuth();
  const { navigate } = useRouter();
  const returnTo = resolveNextParam(window.location.search);
  const email = useMemo(() => new URLSearchParams(window.location.search).get("email") ?? "", []);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [oldPasswordError, setOldPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showForgotPasswordFallback, setShowForgotPasswordFallback] = useState(false);
  const [showReturnToLoginFallback, setShowReturnToLoginFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Stale link / manual nav / bookmark with no ?email= — the read-only email
  // field would otherwise be silently blank and submittable, and the BFF's
  // generic 400 for a missing email gets misclassified as a new-password
  // policy violation by the shared classifier.
  const emailMissing = !email;
  // Only used for the rare "password changed but couldn't auto sign-in"
  // fallback (see classifyChangePasswordRequiredError's changedButLoginFailed)
  // — the happy path navigates straight into the app instead of showing this.
  const [changedButLoginFailed, setChangedButLoginFailed] = useState(false);
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const oldPasswordInputRef = useRef<HTMLInputElement>(null);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnTo);
    }
  }, [isAuthenticated, navigate, returnTo]);

  useEffect(() => {
    if (submitError) {
      submitErrorRef.current?.focus();
    }
  }, [submitError]);

  useEffect(() => {
    if (oldPasswordError) {
      oldPasswordInputRef.current?.focus();
    }
  }, [oldPasswordError]);

  useEffect(() => {
    if (newPasswordError) {
      newPasswordInputRef.current?.focus();
    }
  }, [newPasswordError]);

  useEffect(() => {
    if (confirmPasswordError) {
      confirmPasswordInputRef.current?.focus();
    }
  }, [confirmPasswordError]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOldPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);
    setSubmitError(null);
    setShowForgotPasswordFallback(false);
    setShowReturnToLoginFallback(false);

    if (!oldPassword) {
      setOldPasswordError(
        intl.formatMessage({ id: "auth.passwordChangeRequired.error.oldPasswordRequired" }),
      );
      return;
    }
    if (newPassword.length < VALIDATION.MIN_PASSWORD_LENGTH) {
      setNewPasswordError(intl.formatMessage({ id: "auth.passwordChangeRequired.error.tooShort" }));
      return;
    }
    const characterTypes = countPasswordCharacterClasses(newPassword);
    if (characterTypes < MIN_PASSWORD_CHARACTER_CLASSES) {
      setNewPasswordError(
        intl.formatMessage({ id: "auth.passwordChangeRequired.error.complexity" }),
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(
        intl.formatMessage({ id: "auth.passwordChangeRequired.error.mismatch" }),
      );
      return;
    }

    setSubmitting(true);
    try {
      // On success, AuthContext's state update flips isAuthenticated, and the
      // effect above navigates into the app — no local success state needed.
      await completePasswordChangeRequired(email, oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const changeError = classifyChangePasswordRequiredError(err);
      if (changeError.kind === "changedButLoginFailed") {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setChangedButLoginFailed(true);
      } else if (changeError.kind === "invalidOldPassword") {
        setSubmitError(
          intl.formatMessage({ id: "auth.passwordChangeRequired.error.invalidOldPassword" }),
        );
        setShowForgotPasswordFallback(true);
      } else if (changeError.kind === "notRequired") {
        // Credentials were correct — forgot-password would be the wrong
        // fallback here, offer a way back to the (now-usable) login form
        // instead.
        setSubmitError(intl.formatMessage({ id: "auth.passwordChangeRequired.error.notRequired" }));
        setShowReturnToLoginFallback(true);
      } else if (changeError.kind === "policyViolation") {
        setNewPasswordError(
          changeError.message ??
            intl.formatMessage({ id: "auth.passwordChangeRequired.error.failed" }),
        );
      } else {
        setSubmitError(intl.formatMessage({ id: "auth.passwordChangeRequired.error.failed" }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard titleId="password-change-required-title" compact={changedButLoginFailed}>
      {changedButLoginFailed ? (
        <AuthSuccessPanel
          titleId="password-change-required-title"
          title={intl.formatMessage({ id: "auth.passwordChangeRequired.successTitle" })}
          body={intl.formatMessage({ id: "auth.passwordChangeRequired.success" })}
          ctaLabel={intl.formatMessage({ id: "auth.passwordChangeRequired.returnToLogin" })}
          onCta={() => navigate("/app/login")}
        />
      ) : (
        <>
          <h1
            id="password-change-required-title"
            className="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {intl.formatMessage({ id: "auth.passwordChangeRequired.title" })}
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {intl.formatMessage({ id: "auth.passwordChangeRequired.description" })}
          </p>

          {emailMissing ? (
            <div className="mt-6 space-y-4">
              <InlineNotification
                type="error"
                message={intl.formatMessage({
                  id: "auth.passwordChangeRequired.error.missingEmail",
                })}
              />
              <Button type="button" className="w-full" onClick={() => navigate("/app/login")}>
                {intl.formatMessage({ id: "auth.passwordChangeRequired.returnToLogin" })}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1">
                <Label htmlFor="email">
                  {intl.formatMessage({ id: "auth.passwordChangeRequired.email" })}
                </Label>
                <Input id="email" type="email" value={email} disabled readOnly />
              </div>
              <PasswordInput
                ref={oldPasswordInputRef}
                id="old-password"
                value={oldPassword}
                onChange={(value) => {
                  setOldPassword(value);
                  setOldPasswordError(null);
                  setSubmitError(null);
                  setShowForgotPasswordFallback(false);
                }}
                autoComplete="current-password"
                label={intl.formatMessage({ id: "auth.passwordChangeRequired.oldPassword" })}
                placeholder={intl.formatMessage({ id: "auth.passwordChangeRequired.oldPassword" })}
                required
                error={oldPasswordError ?? undefined}
              />
              <PasswordInput
                ref={newPasswordInputRef}
                id="new-password"
                value={newPassword}
                onChange={(value) => {
                  setNewPassword(value);
                  setNewPasswordError(null);
                  setConfirmPasswordError(null);
                }}
                label={intl.formatMessage({ id: "auth.passwordChangeRequired.newPassword" })}
                placeholder={intl.formatMessage({ id: "auth.passwordChangeRequired.newPassword" })}
                required
                hint={intl.formatMessage({ id: "auth.passwordChangeRequired.passwordHint" })}
                error={newPasswordError ?? undefined}
              />
              <PasswordInput
                ref={confirmPasswordInputRef}
                id="confirm-password"
                value={confirmPassword}
                onChange={(value) => {
                  setConfirmPassword(value);
                  setConfirmPasswordError(null);
                }}
                label={intl.formatMessage({ id: "auth.passwordChangeRequired.confirmPassword" })}
                placeholder={intl.formatMessage({
                  id: "auth.passwordChangeRequired.confirmPassword",
                })}
                required
                error={confirmPasswordError ?? undefined}
              />
              {submitError && (
                <div ref={submitErrorRef} tabIndex={-1} className="outline-none">
                  <InlineNotification type="error" message={submitError} />
                </div>
              )}
              <Button
                type="submit"
                disabled={submitting || !oldPassword || !newPassword || !confirmPassword}
                className="w-full"
              >
                {submitting
                  ? intl.formatMessage({ id: "auth.passwordChangeRequired.submitting" })
                  : intl.formatMessage({ id: "auth.passwordChangeRequired.submit" })}
              </Button>
              {showForgotPasswordFallback && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/app/forgot-password")}
                >
                  {intl.formatMessage({ id: "auth.passwordChangeRequired.forgotPasswordFallback" })}
                </Button>
              )}
              {showReturnToLoginFallback && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/app/login")}
                >
                  {intl.formatMessage({ id: "auth.passwordChangeRequired.returnToLogin" })}
                </Button>
              )}
            </form>
          )}
        </>
      )}
    </AuthCard>
  );
}
