import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithProviders as render } from "@/test/test-utils";
import { HandshakeTestPanel } from "./HandshakeTestPanel";

const TEST_ENDPOINT = "*/v1/mcp-servers/test-handshake";

describe("HandshakeTestPanel", () => {
  const defaultProps = {
    serverUrl: "https://mcp.example.com/mcp",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with the initial idle state", () => {
    render(<HandshakeTestPanel {...defaultProps} />);

    expect(screen.getByDisplayValue("https://mcp.example.com/mcp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^test connection$/i })).toBeInTheDocument();
    expect(screen.getByText(/run a test to see the result here/i)).toBeInTheDocument();
  });

  it("displays URL and headers form fields", () => {
    render(<HandshakeTestPanel {...defaultProps} />);

    expect(screen.getByLabelText(/^url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/headers/i)).toBeInTheDocument();
  });

  it("calls the handshake endpoint and shows a successful result", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          latencyMs: 55,
          negotiationPath: "initialize",
          protocolVersion: "2024-11-05",
          serverName: "My MCP Server",
          serverVersion: "1.2.3",
          componentCounts: { tools: 3, prompts: 1 },
          countsPartial: false,
        });
      }),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/latency: 55 ms/i)).toBeInTheDocument();
    expect(screen.getByText(/initialize/)).toBeInTheDocument();
    expect(screen.getByText(/My MCP Server/)).toBeInTheDocument();

    // Component count badges
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("tools")).toBeInTheDocument();

    // The wire request carries the expected fields.
    expect(requestBody).toEqual(
      expect.objectContaining({ baseUrl: "https://mcp.example.com/mcp" }),
    );
  });

  it("renders a failed handshake as an error", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({
          success: false,
          latencyMs: 12,
          failureClass: "transport",
          error: "Connection refused",
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/transport/i)).toBeInTheDocument();
  });

  it("surfaces a thrown API error", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () => HttpResponse.json({ detail: "Forbidden" }, { status: 403 })),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
    });
  });

  it("forwards headers as a JSON object", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, latencyMs: 10 });
      }),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.type(screen.getByLabelText(/headers/i), '{{"Authorization":"Bearer tok"}');
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(requestBody).toEqual(
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
  });

  it("requires a URL before running", async () => {
    const user = userEvent.setup();
    render(<HandshakeTestPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/url is required/i)).toBeInTheDocument();
    });
  });

  it("rejects an invalid URL", async () => {
    const user = userEvent.setup();
    render(<HandshakeTestPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);
    await user.type(urlField, "not-a-url");
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/url must start with http/i)).toBeInTheDocument();
    });
  });

  it("validates JSON in the headers field before running", async () => {
    const user = userEvent.setup();
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.type(screen.getByLabelText(/headers/i), "invalid json");
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid headers json/i)).toBeInTheDocument();
    });
  });

  it("shows a Cancel button during a test and aborts on click", async () => {
    const user = userEvent.setup();
    let aborted = false;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        await new Promise<void>((resolve) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        });
        return HttpResponse.json({ success: true, latencyMs: 1 });
      }),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
    await user.click(cancelButton);

    await waitFor(() => expect(aborted).toBe(true));
    expect(screen.getByText(/run a test to see the result here/i)).toBeInTheDocument();
  });

  it("cancels the in-flight request when the panel unmounts", async () => {
    const user = userEvent.setup();
    let aborted = false;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        await new Promise<void>((resolve) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        });
        return HttpResponse.json({ success: true, latencyMs: 1 });
      }),
    );
    const { unmount } = render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));
    unmount();

    await waitFor(() => expect(aborted).toBe(true));
  });

  it("clears the URL error as soon as the field is edited", async () => {
    const user = userEvent.setup();
    render(<HandshakeTestPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));
    await waitFor(() => expect(screen.getByText(/url is required/i)).toBeInTheDocument());

    await user.type(urlField, "https://mcp.example.com/mcp");
    expect(screen.queryByText(/url is required/i)).not.toBeInTheDocument();
  });

  it("shows the advertised capabilities", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 20,
          capabilities: { tools: {}, resources: {}, logging: {} },
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(screen.getByText("tools")).toBeInTheDocument();
    expect(screen.getByText("resources")).toBeInTheDocument();
    expect(screen.getByText("logging")).toBeInTheDocument();
  });

  it("shows the credential source used for the handshake", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({ success: true, latencyMs: 20, credentialSource: "form" }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/headers entered in this form/i)).toBeInTheDocument();
  });

  it("shows actionable copy for the failure class", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({
          success: false,
          latencyMs: 12,
          failureClass: "auth",
          error: "401 Unauthorized",
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/401 Unauthorized/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/authentication failed\. check the credentials or headers/i),
    ).toBeInTheDocument();
  });

  it("flags a mismatch between the handshake counts and the virtual server's aggregate", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 20,
          componentCounts: { tools: 1, resources: 2 },
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} aggregatedCounts={{ tools: 3, resources: 2 }} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/counts don.t match the virtual server.s aggregate/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle("Handshake reported 1; the virtual server aggregates 3."),
    ).toBeInTheDocument();
  });

  it("does not show count badges or a mismatch banner when the handshake never returned counts", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        // Real shape returned when the backend blocks the URL before
        // attempting a connection (egress allowlist / test policy).
        HttpResponse.json({
          success: false,
          latencyMs: 1,
          negotiationPath: null,
          protocolVersion: null,
          serverName: null,
          serverVersion: null,
          capabilities: null,
          componentCounts: null,
          countsPartial: false,
          credentialSource: "none",
          failureClass: "transport",
          error: "The MCP server URL is not allowed for testing.",
          rawPreview: null,
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} aggregatedCounts={{ tools: 3, resources: 1 }} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/not allowed for testing/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/none — no credential sent/i)).toBeInTheDocument();
    expect(screen.queryByText(/expected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();
  });

  it("does not flag a mismatch when the handshake counts match the aggregate", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 20,
          componentCounts: { tools: 3 },
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} aggregatedCounts={{ tools: 3 }} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();
  });
});
