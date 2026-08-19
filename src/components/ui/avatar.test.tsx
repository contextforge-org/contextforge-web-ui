import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarFallback } from "./avatar";

describe("Avatar", () => {
  it("renders the root with its data-slot", () => {
    const { container } = render(<Avatar />);
    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it("merges a custom className over the defaults", () => {
    const { container } = render(<Avatar className="size-6 rounded-md" />);
    const root = container.querySelector('[data-slot="avatar"]')!;
    // tailwind-merge must drop the conflicting defaults, not stack them.
    expect(root).toHaveClass("size-6", "rounded-md");
    expect(root).not.toHaveClass("size-8", "rounded-full");
  });

  it("clips overflowing children so images cannot escape the frame", () => {
    const { container } = render(<Avatar />);
    expect(container.querySelector('[data-slot="avatar"]')).toHaveClass("overflow-hidden");
  });

  it("renders fallback content when there is no image", () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("gives the fallback theme-aware surface and foreground tokens", () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const fallback = container.querySelector('[data-slot="avatar-fallback"]')!;
    expect(fallback).toHaveClass("bg-muted", "text-muted-foreground");
  });
});
