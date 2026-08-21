import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders as render } from "@/test/test-utils";
import { ResourceTryItTab } from "./ResourceTryItTab";
import { resourcesApi } from "@/api/resources";
import type { ResourceRead } from "@/generated/types";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/api/resources", () => ({
  resourcesApi: { test: vi.fn() },
}));

function mockResource(overrides?: Partial<NonNullable<ResourceRead>>): NonNullable<ResourceRead> {
  return {
    id: "r1",
    uri: "file:///a.txt",
    name: "a.txt",
    description: null,
    mimeType: "text/plain",
    size: 10,
    createdAt: "2026-06-30T00:00:00",
    updatedAt: "2026-06-30T00:00:00",
    enabled: true,
    ...overrides,
  };
}

function activeCode(): string {
  const pre = document.querySelector('[data-slot="tabs-content"][data-state="active"] pre');
  return pre?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResourceTryItTab", () => {
  it("renders the four snippet tabs and the Preview button, without an args form for a static URI", () => {
    render(
      <ResourceTryItTab
        resources={[mockResource()]}
        selectedResourceId="r1"
        onSelectResource={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: "curl" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "TypeScript" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^preview$/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^arguments$/i })).not.toBeInTheDocument();
  });

  it("shows a required arg per uriTemplate placeholder and reflects it in the live snippet", async () => {
    const user = userEvent.setup();
    render(
      <ResourceTryItTab
        resources={[mockResource({ uriTemplate: "github://repos/{owner}/{repo}" })]}
        selectedResourceId="r1"
        onSelectResource={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/owner/)).toBeInTheDocument();
    expect(screen.getByLabelText(/repo/)).toBeInTheDocument();
    expect(activeCode()).toContain("github://repos//");

    await user.type(screen.getByLabelText(/owner/), "ibm");
    await user.type(screen.getByLabelText(/repo/), "mcp-context-forge");
    expect(activeCode()).toContain("github://repos/ibm/mcp-context-forge");
  });

  it("disables Preview until every required placeholder is filled", async () => {
    const user = userEvent.setup();
    render(
      <ResourceTryItTab
        resources={[mockResource({ uriTemplate: "github://repos/{owner}/{repo}" })]}
        selectedResourceId="r1"
        onSelectResource={vi.fn()}
      />,
    );

    const previewButton = screen.getByRole("button", { name: /^preview$/i });
    expect(previewButton).toBeDisabled();

    await user.type(screen.getByLabelText(/owner/), "ibm");
    expect(previewButton).toBeDisabled();

    await user.type(screen.getByLabelText(/repo/), "mcp-context-forge");
    expect(previewButton).toBeEnabled();

    await user.clear(screen.getByLabelText(/owner/));
    expect(previewButton).toBeDisabled();

    expect(resourcesApi.test).not.toHaveBeenCalled();
  });

  it("calls resourcesApi.test with the resource's uri on Preview", async () => {
    vi.mocked(resourcesApi.test).mockResolvedValue({
      content: { mimeType: "text/plain", text: "hello" },
      status: 200,
    });
    const user = userEvent.setup();
    render(
      <ResourceTryItTab
        resources={[mockResource()]}
        selectedResourceId="r1"
        onSelectResource={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^preview$/i }));

    await waitFor(() =>
      expect(resourcesApi.test).toHaveBeenCalledWith(
        "file:///a.txt",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("shows a chip per resource and switches the selection on click", async () => {
    const user = userEvent.setup();
    const onSelectResource = vi.fn();
    render(
      <ResourceTryItTab
        resources={[
          mockResource({ id: "r1", name: "a.txt" }),
          mockResource({ id: "r2", name: "b.txt" }),
        ]}
        selectedResourceId="r1"
        onSelectResource={onSelectResource}
      />,
    );

    await user.click(screen.getByRole("button", { name: "b.txt" }));
    expect(onSelectResource).toHaveBeenCalledWith(expect.objectContaining({ id: "r2" }));
  });

  it("resets the Preview button and hides the response when the language tab changes", async () => {
    vi.mocked(resourcesApi.test).mockResolvedValue({
      content: { mimeType: "text/plain", text: "hello" },
      status: 200,
    });
    const user = userEvent.setup();
    render(
      <ResourceTryItTab
        resources={[mockResource()]}
        selectedResourceId="r1"
        onSelectResource={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^preview$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /re-run/i })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("tab", { name: "Python" }));

    expect(screen.getByRole("button", { name: /^preview$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-run/i })).not.toBeInTheDocument();
  });
});
