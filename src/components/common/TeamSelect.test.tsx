import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/test-utils";
import type { Team } from "@/types/team";
import { TeamSelect } from "./TeamSelect";

const personalTeam = { id: "team-personal", name: "Personal team", is_personal: true } as Team;
const sharedTeam = { id: "team-shared", name: "Shared team", is_personal: false } as Team;

describe("TeamSelect", () => {
  it("renders nothing for a single team", () => {
    const { container } = renderWithProviders(
      <TeamSelect teams={[personalTeam]} value={personalTeam.id} onChange={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders an error even without a selector", () => {
    // A failed /teams load leaves no teams to choose from, so the error is the
    // only thing explaining why the form will not submit.
    renderWithProviders(<TeamSelect teams={[]} onChange={vi.fn()} error="Team is required" />);

    expect(screen.getByText("Team is required")).toBeInTheDocument();
  });

  it("reports the chosen team", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <TeamSelect teams={[personalTeam, sharedTeam]} value={personalTeam.id} onChange={onChange} />,
    );

    await userEvent.setup().click(screen.getByRole("combobox", { name: /^team/i }));
    await userEvent.setup().click(screen.getByRole("option", { name: "Shared team" }));

    expect(onChange).toHaveBeenCalledWith(sharedTeam.id);
  });

  it("marks the field invalid when in error", () => {
    renderWithProviders(
      <TeamSelect
        teams={[personalTeam, sharedTeam]}
        onChange={vi.fn()}
        error="Team is required"
        id="prompt-team"
      />,
    );

    const select = screen.getByRole("combobox", { name: /^team/i });
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("Team is required");
  });
});
