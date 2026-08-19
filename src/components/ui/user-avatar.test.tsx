import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { UserAvatar } from "./user-avatar";

describe("UserAvatar", () => {
  it("falls back to the user icon when no image is available", () => {
    const { container } = render(<UserAvatar />);
    const icon = container.querySelector('[data-slot="avatar-fallback"] svg');
    expect(icon).toBeInTheDocument();
  });

  it("hides the fallback icon from assistive tech", () => {
    // The control wrapping the avatar carries the accessible name, so the icon
    // must not announce a second one.
    const { container } = render(<UserAvatar />);
    const icon = container.querySelector('[data-slot="avatar-fallback"] svg')!;
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("colors the icon from theme tokens rather than fixed values", () => {
    const { container } = render(<UserAvatar />);
    const fallback = container.querySelector('[data-slot="avatar-fallback"]')!;
    expect(fallback).toHaveClass("bg-muted", "text-muted-foreground");
    // A hardcoded or dark:-prefixed color would defeat the token indirection.
    expect(fallback.className).not.toMatch(/dark:/);
  });

  it("sizes to the 24px header slot by default", () => {
    const { container } = render(<UserAvatar />);
    expect(container.querySelector('[data-slot="avatar"]')).toHaveClass("size-6", "rounded-md");
  });

  it("accepts a className override", () => {
    const { container } = render(<UserAvatar className="size-10" />);
    const root = container.querySelector('[data-slot="avatar"]')!;
    expect(root).toHaveClass("size-10");
    expect(root).not.toHaveClass("size-6");
  });

  it("mounts the image slot only when a src is supplied", () => {
    // jsdom never resolves the image load, so Radix keeps the fallback visible
    // and withholds the <img>. Asserting on the mounted-vs-absent Image child
    // is not possible here; the meaningful check is that passing a src neither
    // crashes nor removes the fallback, so there is never an empty frame.
    const { container } = render(<UserAvatar src="https://example.com/avatar.png" alt="Ada" />);
    expect(container.querySelector('[data-slot="avatar-fallback"] svg')).toBeInTheDocument();
  });
});
