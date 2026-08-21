import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { ResourceDetailsPanel } from "./ResourceDetailsPanel";
import type { ResourceRead } from "@/generated/types";

vi.mock("@/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/resources")>()),
  resourcesApi: { test: vi.fn() },
}));

function mockResource(overrides?: Partial<NonNullable<ResourceRead>>): NonNullable<ResourceRead> {
  return {
    id: "42",
    uri: "file:///a.txt",
    name: "a.txt",
    description: null,
    mimeType: "text/plain",
    size: 10,
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-02T00:00:00",
    enabled: true,
    tags: ["alerts"],
    ...overrides,
  };
}

describe("ResourceDetailsPanel inline tag add", () => {
  it("calls onAddTag with the merged, de-duplicated tag list", async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn().mockResolvedValue(undefined);

    render(
      <ResourceDetailsPanel
        resources={[mockResource()]}
        gatewaySlug="local"
        open
        onClose={vi.fn()}
        onAddTag={onAddTag}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add tags" }));
    await user.type(screen.getByPlaceholderText("Add tags separated with commas"), "dev, alerts");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // "alerts" already exists and is dropped; "dev" is appended.
    expect(onAddTag).toHaveBeenCalledWith("42", ["alerts", "dev"]);
  });

  it("disables the add-tag trigger when onAddTag is omitted", () => {
    render(
      <ResourceDetailsPanel
        resources={[mockResource({ tags: [] })]}
        gatewaySlug="local"
        open
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Add tags" })).toBeDisabled();
  });
});

describe("ResourceDetailsPanel tabs", () => {
  it("opens on the Try it tab by default, with the preview snippet tabs visible", () => {
    render(
      <ResourceDetailsPanel
        resources={[mockResource()]}
        gatewaySlug="local"
        open
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Try it", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "curl" })).toBeInTheDocument();
  });

  it("shares resource selection between the Definition table and the Try it chip picker", async () => {
    const user = userEvent.setup();
    render(
      <ResourceDetailsPanel
        resources={[
          mockResource({ id: "42", name: "a.txt" }),
          mockResource({ id: "43", name: "b.txt" }),
        ]}
        gatewaySlug="local"
        open
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Definition" }));
    expect(screen.getByRole("columnheader", { name: "Resource" })).toBeInTheDocument();

    await user.click(screen.getByText("b.txt"));

    await user.click(screen.getByRole("tab", { name: "Try it" }));
    expect(screen.getByRole("button", { name: "b.txt", pressed: true })).toBeInTheDocument();
  });

  it("moves focus into the newly active panel when a tab is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ResourceDetailsPanel
        resources={[mockResource()]}
        gatewaySlug="local"
        open
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Definition" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("tabpanel", { name: "Definition" }));
    });
  });

  it("leaves focus on the close button when the panel first opens (no tab-change yet)", () => {
    render(
      <ResourceDetailsPanel
        resources={[mockResource()]}
        gatewaySlug="local"
        open
        onClose={vi.fn()}
      />,
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close resource details" }),
    );
  });
});
