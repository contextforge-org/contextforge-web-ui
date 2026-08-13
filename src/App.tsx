import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { AuthProvider } from "./auth/AuthContext";
import { ThemeProvider } from "./hooks/useTheme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouterProvider, Route, Redirect, AuthGuard, useRouter } from "./router";
import { AppShell } from "./components/layout/AppShell";
import { Loading } from "@/components/ui/loading";
import { ErrorBoundary, clearChunkReloadGuard } from "@/components/ErrorBoundary";

// Route-level code splitting: each page becomes its own chunk, fetched only
// when its route is visited, instead of all ~25 pages riding in the initial
// bundle. `lazyNamed` is the shared `.then(m => ({ default: m[key] }))`
// adapter since React.lazy only accepts a default export.
function lazyNamed<M extends Record<string, ComponentType>, K extends keyof M & string>(
  factory: () => Promise<M>,
  key: K,
) {
  return lazy(() => factory().then((m) => ({ default: m[key] })));
}

const Login = lazyNamed(() => import("./pages/Login"), "Login");
const ForgotPassword = lazyNamed(() => import("./pages/ForgotPassword"), "ForgotPassword");
const ResetPassword = lazyNamed(() => import("./pages/ResetPassword"), "ResetPassword");
const ChangePassword = lazyNamed(() => import("./pages/ChangePassword"), "ChangePassword");
const PasswordChangeRequired = lazyNamed(
  () => import("./pages/PasswordChangeRequired"),
  "PasswordChangeRequired",
);
const Dashboard = lazyNamed(() => import("./pages/Dashboard"), "Dashboard");
const Gateways = lazyNamed(() => import("./pages/Gateways"), "Gateways");
const CreateServer = lazyNamed(() => import("./pages/CreateServer"), "CreateServer");
const Servers = lazyNamed(() => import("./pages/Servers"), "Servers");
const Tools = lazyNamed(() => import("./pages/Tools"), "Tools");
const Resources = lazyNamed(() => import("./pages/Resources"), "Resources");
const ServerCatalog = lazyNamed(() => import("./pages/ServerCatalog"), "ServerCatalog");
const Prompts = lazyNamed(() => import("./pages/Prompts"), "Prompts");
const Agents = lazyNamed(() => import("./pages/Agents"), "Agents");
const RestApi = lazyNamed(() => import("./pages/RestApi"), "RestApi");
const Grpc = lazyNamed(() => import("./pages/Grpc"), "Grpc");
const LLMProviders = lazyNamed(() => import("./pages/LLMProviders"), "LLMProviders");
const LLMModels = lazyNamed(() => import("./pages/LLMModels"), "LLMModels");
const Metrics = lazyNamed(() => import("./pages/Metrics"), "Metrics");
const Observability = lazyNamed(() => import("./pages/Observability"), "Observability");
const Plugins = lazyNamed(() => import("./pages/Plugins"), "Plugins");
const Performance = lazyNamed(() => import("./pages/Performance"), "Performance");
const Maintenance = lazyNamed(() => import("./pages/Maintenance"), "Maintenance");
const Settings = lazyNamed(() => import("./pages/Settings"), "Settings");
const NotFound = lazyNamed(() => import("./pages/NotFound"), "NotFound");

function SettingsTabRedirect({ to }: { to: string }) {
  const { path } = useRouter();
  const query = path.split("?")[1];
  return <Redirect to={query ? `${to}?${query}` : to} />;
}
const UsersRedirect = () => <SettingsTabRedirect to="/app/settings/users" />;
const TeamsRedirect = () => <SettingsTabRedirect to="/app/settings/teams" />;
const TokensRedirect = () => <SettingsTabRedirect to="/app/settings/tokens" />;

// ---------------------------------------------------------------------------
// Unauthenticated shell (full-page, no sidebar/header)
// ---------------------------------------------------------------------------
function PublicRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Route path="/app/login" component={Login} />
      <Route path="/app/forgot-password" component={ForgotPassword} />
      <Route path="/app/reset-password/:token" component={ResetPassword} />
      <Route path="/app/change-password-required" component={PasswordChangeRequired} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Authenticated shell (sidebar + header via AppShell)
// ---------------------------------------------------------------------------
function PrivateRoutes() {
  return (
    <AuthGuard>
      <AppShell>
        {/* Suspense sits inside AppShell so sidebar/header render immediately
            and only the route body shows the fallback while its chunk loads. */}
        <Suspense fallback={<Loading />}>
          <Route path="/app/" component={Dashboard} />
          <Route path="/app/change-password" component={ChangePassword} />
          <Route path="/app/gateways" component={Gateways} />
          <Route path="/app/gateways/create-server" component={CreateServer} />
          <Route path="/app/servers" component={Servers} />
          <Route path="/app/tools" component={Tools} />
          <Route path="/app/resources" component={Resources} />
          <Route path="/app/prompts" component={Prompts} />
          <Route path="/app/agents" component={Agents} />
          <Route path="/app/rest-api" component={RestApi} />
          <Route path="/app/grpc" component={Grpc} />
          <Route path="/app/users" component={UsersRedirect} />
          <Route path="/app/teams" component={TeamsRedirect} />
          <Route path="/app/tokens" component={TokensRedirect} />
          <Route path="/app/llm/providers" component={LLMProviders} />
          <Route path="/app/llm/models" component={LLMModels} />
          <Route path="/app/metrics" component={Metrics} />
          <Route path="/app/observability" component={Observability} />
          <Route path="/app/plugins" component={Plugins} />
          <Route path="/app/performance" component={Performance} />
          <Route path="/app/maintenance" component={Maintenance} />
          <Route path="/app/settings" component={Settings} />
          <Route path="/app/settings/:tab" component={Settings} />
          <Route path="/app/not-found" component={NotFound} />
          <Route path="/app/server-catalog" component={ServerCatalog} />
        </Suspense>
      </AppShell>
    </AuthGuard>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export function App() {
  // Mounted without throwing: any stale-chunk auto-reload already did its
  // job, so re-arm it for whatever the *next* deploy breaks.
  useEffect(() => {
    clearChunkReloadGuard();
  }, []);

  return (
    <RouterProvider>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <ErrorBoundary>
              <Routes />
            </ErrorBoundary>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </RouterProvider>
  );
}

function Routes() {
  const { path } = useRouter();

  // Bare /app (no trailing slash) → redirect to dashboard
  if (path === "/app") {
    return <Redirect to="/app/" />;
  }

  return (
    <>
      <PublicRoutes />
      <PrivateRoutes />
    </>
  );
}
