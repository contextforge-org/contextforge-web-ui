import { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { useAuth } from "../auth/useAuth";
import { useRouter, resolveNextParam } from "../router";
import { ApiError } from "../api/client";
import { classifyLoginError } from "../api/loginErrors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Login() {
  const intl = useIntl();
  const { isAuthenticated, login, ssoEnabled, ssoProviderName } = useAuth();
  const { navigate } = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const returnTo = resolveNextParam(window.location.search);
  const ssoErrorParam = useMemo(() => {
    const param = new URLSearchParams(window.location.search).get("error");
    return param?.startsWith("sso_") ? param : null;
  }, []);
  const [error, setError] = useState<string | null>(() =>
    ssoErrorParam ? intl.formatMessage({ id: "auth.login.error.ssoFailed" }) : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnTo);
    }
  }, [isAuthenticated, navigate, returnTo]);

  useEffect(() => {
    if (!ssoErrorParam) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [ssoErrorParam]);

  function handleSsoLogin() {
    window.location.href = `/auth/sso/login?next=${encodeURIComponent(returnTo)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(returnTo);
    } catch (err) {
      const loginError = classifyLoginError(err);
      if (loginError.kind === "passwordChangeRequired") {
        navigate(`/app/change-password-required?email=${encodeURIComponent(email)}`);
        return;
      }
      if (loginError.kind === "invalidCredentials") {
        setError(intl.formatMessage({ id: "auth.login.error.invalidCredentials" }));
      } else if (err instanceof ApiError) {
        setError(intl.formatMessage({ id: "auth.login.error.failed" }, { status: err.status }));
      } else {
        setError(intl.formatMessage({ id: "auth.login.error.unexpected" }));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900">
      <div className="w-full max-w-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-6">
          {intl.formatMessage({ id: "auth.login.title" })}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <Label
              htmlFor="email"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
            >
              {intl.formatMessage({ id: "auth.login.email" })}
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
          </div>
          <div>
            <Label
              htmlFor="password"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
            >
              {intl.formatMessage({ id: "auth.login.password" })}
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded px-3 py-2 text-sm bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-400"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-neutral-900 dark:bg-neutral-700 text-white rounded px-3 py-2 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-600 disabled:opacity-50 transition-colors"
          >
            {loading
              ? intl.formatMessage({ id: "auth.login.submitting" })
              : intl.formatMessage({ id: "auth.login.submit" })}
          </Button>
        </form>
        {ssoEnabled && ssoProviderName && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-neutral-200 dark:border-neutral-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-neutral-800 px-2 text-neutral-500 dark:text-neutral-400">
                  {intl.formatMessage({ id: "auth.login.sso.divider" })}
                </span>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={handleSsoLogin} className="w-full">
              {intl.formatMessage({ id: "auth.login.sso.signIn" }, { provider: ssoProviderName })}
            </Button>
          </>
        )}
        <div className="mt-4 text-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/app/forgot-password")}
            className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            {intl.formatMessage({ id: "auth.login.forgotPassword" })}
          </Button>
        </div>
      </div>
    </div>
  );
}
