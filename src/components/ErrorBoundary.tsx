import { Component, type ErrorInfo, type ReactNode } from "react";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";

// Vite/webpack throw distinct messages when a lazy chunk 404s (stale build
// still referencing a chunk name the latest deploy no longer serves).
const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError|Importing a module script failed/i;

// `error` is typed `Error` by React but isn't guaranteed to be one at
// runtime — `throw "x"` or an empty `Promise.reject()` land here unchanged.
function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || CHUNK_LOAD_ERROR_PATTERN.test(error.message);
}

// One-time auto-reload guard: a stale-chunk error is fixed by a single
// reload (it fetches the new build's manifest); without the guard a page
// that still fails after reloading would reload forever.
const RELOAD_FLAG_KEY = "cf:error-boundary-reloaded";

// Called once the app has rendered successfully, so a *later* chunk-load
// error (e.g. after the next deploy) still gets its one auto-reload.
export function clearChunkReloadGuard() {
  sessionStorage.removeItem(RELOAD_FLAG_KEY);
}

function Fallback({ isChunkError, onReload }: { isChunkError: boolean; onReload: () => void }) {
  const intl = useIntl();
  return (
    <div
      role="alert"
      className="flex min-h-[calc(100vh-200px)] flex-col items-center justify-center gap-4 text-center"
    >
      <p className="text-lg font-semibold">
        {intl.formatMessage({ id: "common.errorBoundary.title" })}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        {intl.formatMessage({
          id: isChunkError
            ? "common.errorBoundary.chunkLoadMessage"
            : "common.errorBoundary.genericMessage",
        })}
      </p>
      <Button onClick={onReload}>
        {intl.formatMessage({ id: "common.errorBoundary.reload" })}
      </Button>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  error: unknown;
  hasError: boolean;
}

// Class component: componentDidCatch has no hook equivalent.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_FLAG_KEY)) {
      sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
      window.location.reload();
      return;
    }
    console.error("Uncaught error in route tree:", error, info.componentStack);
  }

  handleReload = () => {
    sessionStorage.removeItem(RELOAD_FLAG_KEY);
    window.location.reload();
  };

  render() {
    const { error, hasError } = this.state;
    if (hasError) {
      // Chunk-load errors auto-reload once (above); this fallback only
      // renders if that reload didn't fix it, or for non-chunk errors —
      // `error` itself may be null/undefined (e.g. a bare `throw`), so
      // `hasError` — not truthiness of `error` — is what gates this.
      return <Fallback isChunkError={isChunkLoadError(error)} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}
