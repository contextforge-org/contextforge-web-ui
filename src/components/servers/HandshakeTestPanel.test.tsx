import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithProviders as render } from "@/test/test-utils";
import { HandshakeTestPanel } from "./HandshakeTestPanel";

const TEST_ENDPOINT = "*/v1/virtual-servers/:serverId/test-handshake";

describe("HandshakeTestPanel", () => {
  const defaultProps = {
    serverId: "srv-1",
    serverUrl: "https://mcp.example.com/servers/srv-1/mcp",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with the initial idle state", () => {
    render(<HandshakeTestPanel {...defaultProps} />);

    expect(screen.getByText(/^endpoint$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^test connection$/i })).toBeInTheDocument();
    expect(screen.getByText(/run a test to see the result here/i)).toBeInTheDocument();
  });

  it("shows the endpoint read-only and a headers form field", () => {
    render(<HandshakeTestPanel {...defaultProps} />);

    expect(screen.getByText(/^endpoint$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^url$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/headers/i)).toBeInTheDocument();
  });

  it("calls the handshake endpoint scoped to the server ID and shows a successful result", async () => {
    const user = userEvent.setup();
    let requestedUrl = "";
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          success: true,
          latencyMs: 55,
          negotiationPath: "initialize",
          protocolVersion: "2024-11-05",
          serverName: "My MCP Server",
          serverVersion: "1.2.3",
          componentCounts: { tools: 3, prompts: 1 },
          countsPartial: false,
          credentialSource: "session",
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
    expect(screen.getByText("Your own session credentials")).toBeInTheDocument();

    // Component count badges
    expect(screen.getByText("3 tools")).toBeInTheDocument();
    expect(screen.getByText("1 prompt")).toBeInTheDocument();

    // The request targets this server's own ID-scoped route.
    expect(requestedUrl).toContain("/v1/virtual-servers/srv-1/test-handshake");
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

  it("forwards headers as a JSON object, overriding the caller's own session credentials", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, latencyMs: 10, credentialSource: "form" });
      }),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.type(screen.getByLabelText(/headers/i), '{{"Authorization":"Bearer tok"}');
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(requestBody).toEqual({ headers: { Authorization: "Bearer tok" } });
  });

  it("sends no body fields when headers are left blank", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, latencyMs: 10 });
      }),
    );
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(requestBody).toEqual({});
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

  it("rejects header values that aren't strings", async () => {
    const user = userEvent.setup();
    render(<HandshakeTestPanel {...defaultProps} />);

    await user.type(screen.getByLabelText(/headers/i), '{{"X-Count":1}');
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/header values must be strings/i)).toBeInTheDocument();
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

  it("clears the headers error as soon as the field is edited", async () => {
    const user = userEvent.setup();
    render(<HandshakeTestPanel {...defaultProps} />);

    const headersField = screen.getByLabelText(/headers/i);
    await user.type(headersField, "invalid json");
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));
    await waitFor(() => expect(screen.getByText(/invalid headers json/i)).toBeInTheDocument());

    await user.clear(headersField);
    expect(screen.queryByText(/invalid headers json/i)).not.toBeInTheDocument();
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
        // Real shape returned when the virtual server is disabled — the
        // handshake short-circuits before attempting a connection.
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
          error: "Virtual server 'my-server' is disabled. Enable it before testing the connection.",
          rawPreview: null,
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} aggregatedCounts={{ tools: 3, resources: 1 }} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/is disabled\. enable it before testing/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/none — no credential sent/i)).toBeInTheDocument();
    expect(screen.queryByText(/expected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();

    // The disabled-server message is the most common "transport" failure for this
    // in-process probe — the actionable copy below it must not tell the user to
    // check a URL, since there's no caller-editable URL for this endpoint.
    expect(screen.queryByText(/check the url/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/publicly reachable/i)).not.toBeInTheDocument();
  });

  it("does not flag a mismatch when a partial count is merely lower than the aggregate", async () => {
    // A paginated first-page count is a lower bound, not the true count — it
    // being under the aggregate isn't evidence of a real mismatch.
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 20,
          componentCounts: { tools: 1 },
          countsPartial: true,
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} aggregatedCounts={{ tools: 5 }} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/1\+ tool/i)).toBeInTheDocument();
    expect(screen.queryByText(/counts don.t match/i)).not.toBeInTheDocument();
  });

  it("still flags a mismatch when a partial count already exceeds the aggregate", async () => {
    // Even as a lower bound, a reported count already over the expected total
    // is a real mismatch — the true count can only be higher.
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          latencyMs: 20,
          componentCounts: { tools: 5 },
          countsPartial: true,
        }),
      ),
    );
    render(<HandshakeTestPanel {...defaultProps} aggregatedCounts={{ tools: 2 }} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/counts don.t match the virtual server.s aggregate/i),
    ).toBeInTheDocument();
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
