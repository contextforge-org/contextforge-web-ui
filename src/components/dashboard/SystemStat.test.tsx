import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/test-utils";

import { StatBlock, StatRow } from "./SystemStat";
import { UNAVAILABLE } from "./systemMetrics";

describe.each([
  ["StatBlock", StatBlock],
  ["StatRow", StatRow],
])("%s", (_name, Stat) => {
  it("names the unavailable dash for screen readers", () => {
    renderWithProviders(<Stat label="Plugins" value={UNAVAILABLE} />);

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(UNAVAILABLE)).toHaveAttribute("aria-hidden", "true");
  });

  it("leaves a measured value unannotated", () => {
    renderWithProviders(<Stat label="Plugins" value="12" />);

    expect(screen.getByText("12")).not.toHaveAttribute("aria-hidden");
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });

  it("renders a skeleton instead of the value while loading", () => {
    renderWithProviders(<Stat label="Plugins" value={UNAVAILABLE} loading />);

    expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
  });
});
