import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "./textarea";
import { Toaster } from "./sonner";
import { Loading } from "./loading";

// Mock useTheme for Toaster/Sonner
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Mock react-intl for Loading component
vi.mock("react-intl", () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
  }),
}));

// Mock sonner library
vi.mock("sonner", () => ({
  Toaster: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    theme?: string;
    className?: string;
    icons?: Record<string, React.ReactNode>;
    style?: React.CSSProperties;
    toastOptions?: Record<string, unknown>;
  }) => (
    <div data-testid="sonner-toaster" data-theme={props.theme} className={props.className}>
      {children}
    </div>
  ),
}));

import React from "react";

describe("Textarea", () => {
  it("auto-sizes to content with a single shared minimum height", () => {
    render(<Textarea />);
    const ta = screen.getByRole("textbox");
    expect(ta.className).toContain("[field-sizing:content]");
    expect(ta.className).toContain("min-h-[80px]");
  });

  it("resizes vertically only by default", () => {
    render(<Textarea />);
    expect(screen.getByRole("textbox").className).toContain("resize-y");
  });

  it("lets call sites opt out of resizing", () => {
    render(<Textarea className="resize-none" />);
    const ta = screen.getByRole("textbox");
    expect(ta.className).toContain("resize-none");
    expect(ta.className).not.toContain("resize-y");
  });
});

describe("Toaster (sonner)", () => {
  it("passes the resolved app theme to sonner", () => {
    render(<Toaster />);
    expect(screen.getByTestId("sonner-toaster")).toHaveAttribute("data-theme", "light");
  });
});

describe("Loading", () => {
  it("announces itself as a polite live status with an intl label", () => {
    render(<Loading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-label", "common.loading");
  });

  it("page variant shows Context Forge text", () => {
    render(<Loading variant="page" />);
    expect(screen.getByText("Context Forge")).toBeInTheDocument();
  });

  it("inline variant does not show Context Forge text", () => {
    render(<Loading variant="inline" />);
    expect(screen.queryByText("Context Forge")).not.toBeInTheDocument();
  });
});
