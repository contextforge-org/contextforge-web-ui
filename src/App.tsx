import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { AuthProvider } from "./auth/AuthContext";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { ChangePassword } from "./pages/ChangePassword";
import { ThemeProvider } from "./hooks/useTheme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouterProvider, Route, Redirect, AuthGuard, useRouter, matchPath } from "./router";
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

// ForgotPassword/ResetPassword/ChangePassword are a few lines of static
// placeholder JSX each ("Not yet implemented") — splitting them into their
// own chunk costs a request for less code than the import() wiring saves.
const Login = lazyNamed(() => import("./pages/Login"), "Login");
const PasswordChangeRequired = lazyNamed(
  () => import("./pages/PasswordChangeRequired"),
  "PasswordChangeRequired",
);
const Dashboard = lazyNamed(() => import("./pages/Dashboard"), "Dashboard");
// Dashboard is the default post-login landing page (see the /app/ route
// below), so warm its chunk in parallel with the auth check instead of
// waiting for AuthGuard to resolve first — otherwise its own useQuery data
// fetch only starts after chunk-fetch -> parse -> mount, a JS-then-data
// waterfall on the single most common navigation in the app.
void import("./pages/Dashboard");
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

// Rendered as a Suspense *child*, not an ancestor — so its effect only
// fires once the lazy route chunk has actually resolved and mounted, never
// while the fallback is still showing. Clearing the reload guard here (not
// in App itself) is what makes "reload once, then give up" actually hold
// for a chunk that's permanently broken, not just stale.
//
// Gated on `active`: an unmatched <Route> renders null and never suspends,
// so an unrelated Suspense boundary would otherwise commit (and clear the
// guard) before the real chunk elsewhere even loads.
function ClearReloadGuardOnMount({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) clearChunkReloadGuard();
  }, [active]);
  return null;
}

function SettingsTabRedirect({ to }: { to: string }) {
  const { path } = useRouter();
  const query = path.split("?")[1];
  return <Redirect to={query ? `${to}?${query}` : to} />;
}
const UsersRedirect = () => <SettingsTabRedirect to="/app/settings/users" />;
const TeamsRedirect = () => <SettingsTabRedirect to="/app/settings/teams" />;
const TokensRedirect = () => <SettingsTabRedirect to="/app/settings/tokens" />;

type RouteDef = { path: string; component: ComponentType<Record<string, string>> };

// Single source of truth for each tree's routes: rendered as <Route>s below
// and reused to compute whether the current path actually belongs to this
// tree, for ClearReloadGuardOnMount's gating (see comment above it).
const PUBLIC_ROUTE_DEFS: RouteDef[] = [
  { path: "/app/login", component: Login },
  { path: "/app/forgot-password", component: ForgotPassword },
  { path: "/app/reset-password/:token", component: ResetPassword },
  { path: "/app/change-password-required", component: PasswordChangeRequired },
];

const PRIVATE_ROUTE_DEFS: RouteDef[] = [
  { path: "/app/", component: Dashboard },
  { path: "/app/change-password", component: ChangePassword },
  { path: "/app/gateways", component: Gateways },
  { path: "/app/gateways/create-server", component: CreateServer },
  { path: "/app/servers", component: Servers },
  { path: "/app/tools", component: Tools },
  { path: "/app/resources", component: Resources },
  { path: "/app/prompts", component: Prompts },
  { path: "/app/agents", component: Agents },
  { path: "/app/rest-api", component: RestApi },
  { path: "/app/grpc", component: Grpc },
  { path: "/app/users", component: UsersRedirect },
  { path: "/app/teams", component: TeamsRedirect },
  { path: "/app/tokens", component: TokensRedirect },
  { path: "/app/llm/providers", component: LLMProviders },
  { path: "/app/llm/models", component: LLMModels },
  { path: "/app/metrics", component: Metrics },
  { path: "/app/observability", component: Observability },
  { path: "/app/plugins", component: Plugins },
  { path: "/app/performance", component: Performance },
  { path: "/app/maintenance", component: Maintenance },
  { path: "/app/settings", component: Settings },
  { path: "/app/settings/:tab", component: Settings },
  { path: "/app/not-found", component: NotFound },
  { path: "/app/server-catalog", component: ServerCatalog },
];

function matchesAny(defs: RouteDef[], pathname: string): boolean {
  return defs.some((r) => matchPath(r.path, pathname) !== null);
}

// ---------------------------------------------------------------------------
// Unauthenticated shell (full-page, no sidebar/header)
// ---------------------------------------------------------------------------
function PublicRoutes() {
  const { path } = useRouter();
  const pathname = path.split("?")[0];
  const isActive = matchesAny(PUBLIC_ROUTE_DEFS, pathname);

  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <ClearReloadGuardOnMount active={isActive} />
        {PUBLIC_ROUTE_DEFS.map((r) => (
          <Route key={r.path} path={r.path} component={r.component} />
        ))}
      </Suspense>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Authenticated shell (sidebar + header via AppShell)
// ---------------------------------------------------------------------------
function PrivateRoutes() {
  const { path } = useRouter();
  const pathname = path.split("?")[0];
  const isActive = matchesAny(PRIVATE_ROUTE_DEFS, pathname);

  return (
    <AuthGuard>
      <AppShell>
        {/* ErrorBoundary + Suspense both sit inside AppShell so sidebar/header
            stay mounted: a broken route chunk (or a render error in one page)
            shows a fallback in the route body only, never takes down nav. */}
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <ClearReloadGuardOnMount active={isActive} />
            {PRIVATE_ROUTE_DEFS.map((r) => (
              <Route key={r.path} path={r.path} component={r.component} />
            ))}
          </Suspense>
        </ErrorBoundary>
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
