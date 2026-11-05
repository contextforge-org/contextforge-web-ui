import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Progress } from "./progress";

const indicatorOf = (container: HTMLElement) =>
  container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;

describe("Progress", () => {
  it.each([
    { value: 0, expected: "translateX(-100%)" },
    { value: 25, expected: "translateX(-75%)" },
    { value: 100, expected: "translateX(-0%)" },
    { value: undefined, expected: "translateX(-100%)" },
  ])("translates the indicator for value=$value", ({ value, expected }) => {
    const { container } = render(<Progress value={value} />);
    expect(indicatorOf(container)).toHaveStyle({ transform: expected });
  });

  it("updates the transform when value changes", () => {
    const { container, rerender } = render(<Progress value={25} />);
    rerender(<Progress value={75} />);
    expect(indicatorOf(container)).toHaveStyle({ transform: "translateX(-25%)" });
  });
});
