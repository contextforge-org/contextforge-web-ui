import { lazy, Suspense } from "react";
import { AuthProvider } from "./auth/AuthContext";
import { ThemeProvider } from "./hooks/useTheme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouterProvider, Route, Redirect, AuthGuard, useRouter } from "./router";
import { AppShell } from "./components/layout/AppShell";
import { Loading } from "@/components/ui/loading";

// Route-level code splitting: each page becomes its own chunk, fetched only
// when its route is visited, instead of all ~25 pages riding in the initial
// bundle. Named exports need the `.then(m => ({ default: m.X }))` adapter
// since React.lazy only accepts a default export.
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const ForgotPassword = lazy(() =>
  import("./pages/ForgotPassword").then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import("./pages/ResetPassword").then((m) => ({ default: m.ResetPassword })),
);
const ChangePassword = lazy(() =>
  import("./pages/ChangePassword").then((m) => ({ default: m.ChangePassword })),
);
const PasswordChangeRequired = lazy(() =>
  import("./pages/PasswordChangeRequired").then((m) => ({ default: m.PasswordChangeRequired })),
);
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Gateways = lazy(() => import("./pages/Gateways").then((m) => ({ default: m.Gateways })));
const CreateServer = lazy(() =>
  import("./pages/CreateServer").then((m) => ({ default: m.CreateServer })),
);
const Servers = lazy(() => import("./pages/Servers").then((m) => ({ default: m.Servers })));
const Tools = lazy(() => import("./pages/Tools").then((m) => ({ default: m.Tools })));
const Resources = lazy(() => import("./pages/Resources").then((m) => ({ default: m.Resources })));
const ServerCatalog = lazy(() =>
  import("./pages/ServerCatalog").then((m) => ({ default: m.ServerCatalog })),
);
const Prompts = lazy(() => import("./pages/Prompts").then((m) => ({ default: m.Prompts })));
const Agents = lazy(() => import("./pages/Agents").then((m) => ({ default: m.Agents })));
const RestApi = lazy(() => import("./pages/RestApi").then((m) => ({ default: m.RestApi })));
const Grpc = lazy(() => import("./pages/Grpc").then((m) => ({ default: m.Grpc })));
const LLMProviders = lazy(() =>
  import("./pages/LLMProviders").then((m) => ({ default: m.LLMProviders })),
);
const LLMModels = lazy(() => import("./pages/LLMModels").then((m) => ({ default: m.LLMModels })));
const Metrics = lazy(() => import("./pages/Metrics").then((m) => ({ default: m.Metrics })));
const Observability = lazy(() =>
  import("./pages/Observability").then((m) => ({ default: m.Observability })),
);
const Plugins = lazy(() => import("./pages/Plugins").then((m) => ({ default: m.Plugins })));
const Performance = lazy(() =>
  import("./pages/Performance").then((m) => ({ default: m.Performance })),
);
const Maintenance = lazy(() =>
  import("./pages/Maintenance").then((m) => ({ default: m.Maintenance })),
);
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));

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
  return (
    <RouterProvider>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Routes />
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
