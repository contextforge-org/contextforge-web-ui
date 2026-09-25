import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { OctagonXIcon } from "lucide-react";

import { renderWithProviders, screen } from "@/test/test-utils";
import { StatusIndicator } from "./status-indicator";

const props = {
  Icon: OctagonXIcon,
  iconClassName: "text-destructive",
  label: "Error",
};

describe("StatusIndicator", () => {
  it("opens its popover on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatusIndicator {...props} triggerAriaLabel="Show details">
        <p>Unable to add this server.</p>
      </StatusIndicator>,
    );

    await user.click(screen.getByRole("button", { name: "Show details" }));

    expect(await screen.findByText("Unable to add this server.")).toBeVisible();
  });

  it("names the popover it opens", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatusIndicator
        {...props}
        triggerAriaLabel="Show details"
        contentAriaLabel="Acme add failure details"
      >
        <p>Unable to add this server.</p>
      </StatusIndicator>,
    );

    await user.click(screen.getByRole("button", { name: "Show details" }));

    expect(await screen.findByRole("dialog", { name: "Acme add failure details" })).toBeVisible();
  });

  it("names the popover from the label where the caller gives no name", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatusIndicator {...props} fullLabel="Error adding server" triggerAriaLabel="Show details">
        <p>Unable to add this server.</p>
      </StatusIndicator>,
    );

    await user.click(screen.getByRole("button", { name: "Show details" }));

    expect(await screen.findByRole("dialog", { name: "Error adding server" })).toBeVisible();
  });

  it("falls through a blank name rather than leaving the popover unnamed", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StatusIndicator {...props} contentAriaLabel="" triggerAriaLabel="Show details">
        <p>Unable to add this server.</p>
      </StatusIndicator>,
    );

    await user.click(screen.getByRole("button", { name: "Show details" }));

    expect(await screen.findByRole("dialog", { name: "Error" })).toBeVisible();
  });

  // A button is named by its content, so the trigger needs no aria-label fallback.
  it("names the trigger from the visible label where the caller gives no name", () => {
    renderWithProviders(
      <StatusIndicator {...props}>
        <p>Unable to add this server.</p>
      </StatusIndicator>,
    );

    expect(screen.getByRole("button", { name: "Error" })).toBeInTheDocument();
  });

  it("names the trigger from the full label where the visible one is abbreviated", () => {
    renderWithProviders(
      <StatusIndicator {...props} fullLabel="Error adding server">
        <p>Unable to add this server.</p>
      </StatusIndicator>,
    );

    expect(screen.getByRole("button", { name: "Error adding server" })).toBeInTheDocument();
  });

  it("announces the full label where the visible one is abbreviated", () => {
    renderWithProviders(
      <StatusIndicator {...props} fullLabel="Error adding server" triggerAriaLabel="Show details">
        <p>Detail</p>
      </StatusIndicator>,
    );

    expect(screen.getByText("Error")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Error adding server")).toBeInTheDocument();
  });

  it("leaves the label announced where it is not abbreviated", () => {
    renderWithProviders(
      <StatusIndicator {...props} fullLabel="Error" triggerAriaLabel="Show details">
        <p>Detail</p>
      </StatusIndicator>,
    );

    expect(screen.getByText("Error")).not.toHaveAttribute("aria-hidden");
  });

  it("renders as plain text where a button cannot nest", () => {
    renderWithProviders(
      <StatusIndicator {...props} interactive={false}>
        <p>Detail</p>
      </StatusIndicator>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("renders as plain text with nothing to explain", () => {
    renderWithProviders(<StatusIndicator {...props} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
