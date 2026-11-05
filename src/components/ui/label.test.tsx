import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { Label } from "./label";
import { cn } from "@/lib/utils";

// The CVA base string itself, mirroring label.tsx: leading-none is no longer
// in it, so a call-site "text-sm" can never strip it via tailwind-merge.
const labelBaseClasses =
  "text-sm font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70";

describe("Label", () => {
  it("should carry data-slot=label so globals.css can set its line-height", () => {
    const { container } = render(<Label>Label</Label>);
    expect(container.querySelector("label")).toHaveAttribute("data-slot", "label");
  });

  it("preserves the label's line-height when text-sm is re-passed as className", () => {
    // text-sm can no longer collide with leading-none in twMerge, since
    // leading-none isn't in the CVA string at all anymore (it's CSS-only).
    const merged = cn(labelBaseClasses, "text-sm");
    expect(merged).not.toMatch(/\bleading-(?!none)\w+/);
  });

  // Regression test for the cascade-layer bug: [data-slot="label"] lives
  // unlayered in index.css so it can outrank Tailwind's `.text-sm` (which is
  // in `@layer utilities`). Being unlayered means it would otherwise beat
  // *any* layered rule unconditionally, regardless of specificity —
  // permanently blocking a caller's own "leading-*" override. The
  // :not([class*="leading-"]) guard is what makes that override possible
  // again; this fails if the guard is ever dropped.
  describe('[data-slot="label"] line-height CSS rule', () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../index.css"), "utf-8");
    const rule = css.match(/\[data-slot="label"\][^{]*\{[^}]*\}/);

    it("exists and is guarded against callers that already set a leading-* class", () => {
      expect(rule).not.toBeNull();
      expect(rule![0]).toMatch(/:not\(\[class\*="leading-"\]\)/);
    });

    describe("applied behaviour", () => {
      const injected = document.createElement("style");

      afterEach(() => {
        injected.remove();
        document.body.innerHTML = "";
      });

      function renderLabel(className: string) {
        injected.textContent = rule![0];
        document.head.appendChild(injected);
        const el = document.createElement("label");
        el.setAttribute("data-slot", "label");
        el.className = className;
        document.body.appendChild(el);
        return el;
      }

      it("forces line-height:1 on a label with no leading-* class", () => {
        const el = renderLabel("text-sm font-medium");
        expect(getComputedStyle(el).lineHeight).toBe("1");
      });

      it("does not clobber a label that carries an explicit leading-* class (e.g. ExposeComponentsForm's OAuth description)", () => {
        const el = renderLabel(
          "text-sm font-normal leading-relaxed text-neutral-600 dark:text-neutral-400 cursor-pointer",
        );
        expect(getComputedStyle(el).lineHeight).not.toBe("1");
      });
    });
  });
});
