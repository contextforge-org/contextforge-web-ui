import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serversApi } from "@/api/servers";
import { renderWithProviders as render } from "@/test/test-utils";
import { MCPServerMetadataProbe } from "./MCPServerMetadataProbe";

const defaultProps = {
  serverUrl: "https://mcp.example.com/mcp",
  name: "",
  description: "",
  onNameChange: vi.fn(),
  onDescriptionChange: vi.fn(),
};

describe("MCPServerMetadataProbe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefills empty fields from a successful initialize result", async () => {
    const onNameChange = vi.fn();
    const onDescriptionChange = vi.fn();
    vi.spyOn(serversApi, "testHandshake").mockResolvedValue({
      success: true,
      latencyMs: 12,
      serverName: "Example\u0000 MCP",
      rawPreview: JSON.stringify({ instructions: "Use <strong>safely</strong>." }),
    });

    render(
      <MCPServerMetadataProbe
        {...defaultProps}
        onNameChange={onNameChange}
        onDescriptionChange={onDescriptionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(onNameChange).toHaveBeenCalledWith("Example MCP"));
    expect(onDescriptionChange).toHaveBeenCalledWith("Use <strong>safely</strong>.");
    expect(screen.getByRole("status")).toHaveTextContent(/Connection succeeded/i);
  });

  it("does not overwrite existing values without explicit confirmation", async () => {
    const onNameChange = vi.fn();
    const onDescriptionChange = vi.fn();
    vi.spyOn(serversApi, "testHandshake").mockResolvedValue({
      success: true,
      latencyMs: 12,
      serverName: "Detected name",
      rawPreview: JSON.stringify({ instructions: "Detected description" }),
    });

    render(
      <MCPServerMetadataProbe
        {...defaultProps}
        name="Existing name"
        description="Existing description"
        onNameChange={onNameChange}
        onDescriptionChange={onDescriptionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("Replace existing server details?")).toBeInTheDocument();
    expect(onNameChange).not.toHaveBeenCalled();
    expect(onDescriptionChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Replace details" }));
    expect(onNameChange).toHaveBeenCalledWith("Detected name");
    expect(onDescriptionChange).toHaveBeenCalledWith("Detected description");
  });

  it("shows handshake failures without changing form values", async () => {
    const onNameChange = vi.fn();
    vi.spyOn(serversApi, "testHandshake").mockResolvedValue({
      success: false,
      latencyMs: 8,
      error: "Authentication required",
    });

    render(<MCPServerMetadataProbe {...defaultProps} onNameChange={onNameChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication required");
    expect(onNameChange).not.toHaveBeenCalled();
  });
});
