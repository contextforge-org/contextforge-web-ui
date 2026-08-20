import { ReactElement, ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock authenticated state by default
export function setupAuthenticatedTest() {
  localStorage.setItem("token", "mock-token");
  localStorage.setItem("user-locale", "en-US");
  window.history.pushState({}, "", "/app/");
}

function AllTheProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </I18nProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from "@testing-library/react";
