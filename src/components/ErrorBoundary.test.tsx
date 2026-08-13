import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary, clearChunkReloadGuard } from "./ErrorBoundary";

vi.mock("react-intl", () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
  }),
}));

function Bomb({ message }: { message: string }): never {
  throw new Error(message);
}

// Silence React's error-boundary console.error noise for these tests.
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("ErrorBoundary", () => {
  const originalReload = window.location.reload;

  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    });
  });

  afterEach(() => {
    window.location.reload = originalReload;
    consoleErrorSpy.mockClear();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("shows generic fallback and logs for a non-chunk error", () => {
    render(
      <ErrorBoundary>
        <Bomb message="boom" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("common.errorBoundary.genericMessage")).toBeTruthy();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("auto-reloads once on a chunk-load error", () => {
    render(
      <ErrorBoundary>
        <Bomb message="Failed to fetch dynamically imported module" />
      </ErrorBoundary>,
    );
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("does not auto-reload a chunk error twice in the same session", () => {
    sessionStorage.setItem("cf:error-boundary-reloaded", "1");
    render(
      <ErrorBoundary>
        <Bomb message="Failed to fetch dynamically imported module" />
      </ErrorBoundary>,
    );
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(screen.getByText("common.errorBoundary.chunkLoadMessage")).toBeTruthy();
  });

  it("reload button clears the guard and reloads", () => {
    sessionStorage.setItem("cf:error-boundary-reloaded", "1");
    render(
      <ErrorBoundary>
        <Bomb message="boom" />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText("common.errorBoundary.reload"));
    expect(sessionStorage.getItem("cf:error-boundary-reloaded")).toBeNull();
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("clearChunkReloadGuard removes the session flag", () => {
    sessionStorage.setItem("cf:error-boundary-reloaded", "1");
    clearChunkReloadGuard();
    expect(sessionStorage.getItem("cf:error-boundary-reloaded")).toBeNull();
  });
});
