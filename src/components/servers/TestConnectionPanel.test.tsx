import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithProviders as render } from "@/test/test-utils";
import { TestConnectionPanel } from "./TestConnectionPanel";

const TEST_ENDPOINT = "*/v1/mcp-servers/test";
const HANDSHAKE_ENDPOINT = "*/v1/mcp-servers/test-handshake";

async function selectHandshakeMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: /test type/i }));
  await user.click(screen.getByRole("option", { name: /mcp handshake/i }));
}

describe("TestConnectionPanel", () => {
  const defaultProps = {
    serverUrl: "https://example.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with initial state", () => {
    render(<TestConnectionPanel {...defaultProps} />);

    expect(screen.getByDisplayValue("https://example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^test connection$/i })).toBeInTheDocument();
    expect(screen.getByText(/run a test to see the response/i)).toBeInTheDocument();
  });

  it("displays all form fields", () => {
    render(<TestConnectionPanel {...defaultProps} />);

    expect(screen.getByLabelText(/^url/i)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /method/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/content type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/headers/i)).toBeInTheDocument();
  });

  it("exposes HTTP methods as radio options", () => {
    render(<TestConnectionPanel {...defaultProps} />);

    expect(screen.getByRole("radio", { name: "Get" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Post" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Patch" })).toBeInTheDocument();
  });

  it("hides the body field for GET and shows it for other methods", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    // GET is selected by default — no body field.
    expect(screen.queryByLabelText(/body/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Post" }));

    expect(screen.getByLabelText(/body/i)).toBeInTheDocument();
  });

  it("calls the connectivity endpoint and shows a successful response", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        // Response uses camelCase — FastAPI serializes with by_alias=True.
        return HttpResponse.json({ statusCode: 200, latencyMs: 42, body: { ok: true } });
      }),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/status: 200 ok/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/latency: 42 ms/i)).toBeInTheDocument();
    // The wire request must use the backend's camelCase field names.
    expect(requestBody).toEqual(
      expect.objectContaining({
        method: "GET",
        baseUrl: "https://example.com",
        path: "",
        contentType: "application/json",
      }),
    );
  });

  it("renders a non-2xx response as an error", async () => {
    const user = userEvent.setup();
    // The endpoint returns HTTP 200 with a semantic error status in the body.
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({ statusCode: 502, latencyMs: 10, body: { error: "Request failed" } }),
      ),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/status: 502 error/i)).toBeInTheDocument();
    });
  });

  it("surfaces a thrown API error", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(TEST_ENDPOINT, () =>
        HttpResponse.json({ detail: "Access denied" }, { status: 403 }),
      ),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
  });

  it("parses a JSON body into an object before sending", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ statusCode: 200, latencyMs: 5, body: {} });
      }),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.click(screen.getByRole("radio", { name: "Post" }));
    await user.type(screen.getByLabelText(/body/i), '{{"hello":"world"}');
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/status: 200 ok/i)).toBeInTheDocument();
    });
    expect(requestBody).toEqual(
      expect.objectContaining({ method: "POST", body: { hello: "world" } }),
    );
  });

  it("forwards valid headers as a JSON object", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ statusCode: 200, latencyMs: 3, body: {} });
      }),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.type(
      screen.getByLabelText(/headers/i),
      '{{"Authorization":"Bearer tok","X-Trace":"1"}',
    );
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/status: 200 ok/i)).toBeInTheDocument();
    });
    expect(requestBody).toEqual(
      expect.objectContaining({ headers: { Authorization: "Bearer tok", "X-Trace": "1" } }),
    );
  });

  it("forwards a non-empty path", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ statusCode: 200, latencyMs: 3, body: {} });
      }),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.type(screen.getByLabelText(/^path/i), "/health");
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/status: 200 ok/i)).toBeInTheDocument();
    });
    expect(requestBody).toEqual(expect.objectContaining({ path: "/health" }));
  });

  it("sends a non-JSON body as a raw string without JSON validation", async () => {
    const user = userEvent.setup();
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ statusCode: 200, latencyMs: 3, body: {} });
      }),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.click(screen.getByRole("radio", { name: "Post" }));
    // Switch content type away from JSON so the body is sent verbatim.
    await user.click(screen.getByRole("combobox", { name: /content type/i }));
    await user.click(screen.getByRole("option", { name: /x-www-form-urlencoded/i }));
    // A non-JSON body must NOT trigger the "Invalid body JSON" validation.
    await user.type(screen.getByLabelText(/body/i), "name=subway&line=A");
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/status: 200 ok/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid body json/i)).not.toBeInTheDocument();
    expect(requestBody).toEqual(
      expect.objectContaining({
        contentType: "application/x-www-form-urlencoded",
        body: "name=subway&line=A",
      }),
    );
  });

  it("cancels the in-flight request when the panel unmounts", async () => {
    const user = userEvent.setup();
    let aborted = false;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        // Resolve only once the client aborts, so the test can observe cancellation.
        await new Promise<void>((resolve) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        });
        return HttpResponse.json({ statusCode: 200, latencyMs: 1, body: {} });
      }),
    );
    const { unmount } = render(<TestConnectionPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));
    // Unmount (e.g. tab switch / drawer close) while the request is in flight.
    unmount();

    await waitFor(() => expect(aborted).toBe(true));
  });

  it("shows a Cancel button during a test and aborts on click", async () => {
    const user = userEvent.setup();
    let aborted = false;
    server.use(
      http.post(TEST_ENDPOINT, async ({ request }) => {
        // Resolve only once the client aborts, so the test can observe cancellation.
        await new Promise<void>((resolve) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            resolve();
          });
        });
        return HttpResponse.json({ statusCode: 200, latencyMs: 1, body: {} });
      }),
    );
    render(<TestConnectionPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    // While in flight a Cancel button appears; clicking it aborts the request
    // and returns the panel to its idle state.
    const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
    await user.click(cancelButton);

    await waitFor(() => expect(aborted).toBe(true));
    expect(screen.getByText(/run a test to see the response/i)).toBeInTheDocument();
  });

  it("requires a URL before running", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/url is required/i)).toBeInTheDocument();
    });
  });

  it("rejects an invalid URL before running", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);
    await user.type(urlField, "not-a-url");

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/url must start with http/i)).toBeInTheDocument();
    });
  });

  it("validates JSON in headers field before running", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const headersField = screen.getByLabelText(/headers/i);
    await user.clear(headersField);
    await user.type(headersField, "invalid json");

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid headers json/i)).toBeInTheDocument();
    });
  });

  it("validates JSON in body field before running", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    // Body is only available for non-GET methods.
    await user.click(screen.getByRole("radio", { name: "Post" }));

    const bodyField = screen.getByLabelText(/body/i);
    await user.type(bodyField, "not json");

    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid body json/i)).toBeInTheDocument();
    });
  });

  it("renders the URL error inline and marks the field invalid", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => expect(urlField).toHaveAttribute("aria-invalid", "true"));
    // The error is associated with the field for assistive tech.
    expect(urlField).toHaveAttribute("aria-describedby", "url-error");
    expect(screen.getByText(/url is required/i)).toHaveAttribute("id", "url-error");
  });

  it("validates a field on blur, before any submit", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);
    await user.type(urlField, "not-a-url");
    await user.tab(); // blur

    await waitFor(() => {
      expect(screen.getByText(/url must start with http/i)).toBeInTheDocument();
    });
  });

  it("clears a field's error as soon as it is edited", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const urlField = screen.getByLabelText(/^url/i);
    await user.clear(urlField);
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));
    await waitFor(() => expect(screen.getByText(/url is required/i)).toBeInTheDocument());

    await user.type(urlField, "https://example.com");
    expect(screen.queryByText(/url is required/i)).not.toBeInTheDocument();
  });

  it("flags a scheme/host pasted into the Path field", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const pathField = screen.getByLabelText(/^path/i);
    await user.type(pathField, "https://evil.com/health");
    await user.click(screen.getByRole("button", { name: /^test connection$/i }));

    await waitFor(() => {
      expect(screen.getByText(/path shouldn't include a scheme or host/i)).toBeInTheDocument();
    });
  });

  it("accepts a plain path without a scheme", async () => {
    const user = userEvent.setup();
    render(<TestConnectionPanel {...defaultProps} />);

    const pathField = screen.getByLabelText(/^path/i);
    await user.type(pathField, "/health");
    await user.tab();

    expect(screen.queryByText(/path shouldn't include a scheme or host/i)).not.toBeInTheDocument();
  });

  describe("MCP handshake mode", () => {
    it("hides Method, Content type, and Body while keeping URL, Path, and Headers", async () => {
      const user = userEvent.setup();
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);

      expect(screen.getByLabelText(/^url/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^path/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/headers/i)).toBeInTheDocument();
      expect(screen.queryByRole("radiogroup", { name: /method/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/content type/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/body/i)).not.toBeInTheDocument();
    });

    it("shows the stored-credentials hint under Headers", async () => {
      const user = userEvent.setup();
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);

      expect(screen.getByText(/stored credentials for registered servers/i)).toBeInTheDocument();
    });

    it("renders server identity rows and component count badges on success", async () => {
      const user = userEvent.setup();
      let requestBody: Record<string, unknown> | undefined;
      server.use(
        http.post(HANDSHAKE_ENDPOINT, async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            success: true,
            latencyMs: 12,
            negotiationPath: "server_discover",
            protocolVersion: "2026-07-28",
            serverName: "git-server",
            serverVersion: "1.2.3",
            capabilities: { tools: {}, resources: {} },
            componentCounts: { tools: 3, resources: 1 },
            countsPartial: false,
            credentialSource: "none",
          });
        }),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
      });
      expect(screen.getByText("git-server")).toBeInTheDocument();
      expect(screen.getByText("1.2.3")).toBeInTheDocument();
      expect(screen.getByText("2026-07-28")).toBeInTheDocument();
      expect(screen.getByText("server/discover")).toBeInTheDocument();
      expect(screen.getByText("3 tools")).toBeInTheDocument();
      expect(screen.getByText("1 resource")).toBeInTheDocument();
      expect(requestBody).toEqual(expect.objectContaining({ baseUrl: "https://example.com" }));
    });

    it("keeps the plural label when counts are partial", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: true,
            latencyMs: 12,
            negotiationPath: "server_discover",
            protocolVersion: "2026-07-28",
            serverName: "git-server",
            serverVersion: "1.2.3",
            capabilities: { tools: {} },
            componentCounts: { tools: 1 },
            countsPartial: true,
            credentialSource: "none",
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText("1+ tools")).toBeInTheDocument();
      });
    });

    it("clears field errors when switching modes", async () => {
      const user = userEvent.setup();
      render(<TestConnectionPanel {...defaultProps} />);

      await user.clear(screen.getByLabelText(/^url/i));
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));
      await waitFor(() => expect(screen.getByText(/url is required/i)).toBeInTheDocument());

      await selectHandshakeMode(user);

      expect(screen.queryByText(/url is required/i)).not.toBeInTheDocument();
    });

    it.each([
      ["transport", "Transport"],
      ["protocol", "Protocol negotiation"],
      ["auth", "Authentication"],
      ["invalid_response", "Invalid response"],
    ])("renders the %s failure classification and error copy", async (failureClass, label) => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: false,
            latencyMs: 5,
            credentialSource: "none",
            failureClass,
            error: "Actionable copy for the failure.",
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(screen.getByText(/handshake failed/i)).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText("Actionable copy for the failure.")).toBeInTheDocument();
    });

    it("keeps the diagnostic rows visible when the handshake fails", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: false,
            latencyMs: 5,
            failureClass: "auth",
            credentialSource: "stored",
            serverName: "srv",
            protocolVersion: "2026-07-28",
            negotiationPath: "initialize",
            error: "Authentication rejected by the server.",
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText("Authentication")).toBeInTheDocument();
      });
      expect(screen.getByText("Stored server credentials")).toBeInTheDocument();
      expect(screen.getByText("srv")).toBeInTheDocument();
      expect(screen.getByText("2026-07-28")).toBeInTheDocument();
      expect(screen.getByText("initialize")).toBeInTheDocument();
    });

    it("renders an unrecognized negotiation path verbatim", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: true,
            latencyMs: 12,
            negotiationPath: "future_path",
            credentialSource: "none",
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
      });
      expect(screen.getByText("future_path")).toBeInTheDocument();
    });

    it("shows the API error once and keeps the generic failure headline", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({ detail: "Upstream exploded." }, { status: 500 }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText(/handshake failed/i)).toBeInTheDocument();
      });
      expect(screen.getAllByText("Upstream exploded.")).toHaveLength(1);
    });

    it("drops the previous result when a re-test fails validation", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({ success: true, latencyMs: 12, credentialSource: "none" }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));
      await waitFor(() => {
        expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
      });

      await user.clear(screen.getByLabelText(/^url/i));
      await user.click(screen.getByRole("button", { name: /re-test connection/i }));

      await waitFor(() => expect(screen.getByText(/url is required/i)).toBeInTheDocument());
      expect(screen.queryByText(/handshake succeeded/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/handshake failed/i)).not.toBeInTheDocument();
    });

    it("points the Headers field at the stored-credentials hint", async () => {
      const user = userEvent.setup();
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);

      const hint = screen.getByText(/stored credentials for registered servers/i);
      expect(hint.id).toBe("headers-hint");
      expect(screen.getByLabelText(/headers/i)).toHaveAttribute("aria-describedby", "headers-hint");
    });

    it("describes the Headers field by both the error and the hint", async () => {
      const user = userEvent.setup();
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.type(screen.getByLabelText(/headers/i), "not json");
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => expect(screen.getByText(/invalid headers json/i)).toBeInTheDocument());
      expect(screen.getByLabelText(/headers/i)).toHaveAttribute(
        "aria-describedby",
        "headers-error headers-hint",
      );
    });

    it("rejects non-string header values instead of posting them", async () => {
      const user = userEvent.setup();
      let requested = false;
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () => {
          requested = true;
          return HttpResponse.json({ success: true, latencyMs: 1, credentialSource: "none" });
        }),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.type(screen.getByLabelText(/headers/i), '{{"X-Retry": 3}');
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() =>
        expect(screen.getByText(/header values must be strings/i)).toBeInTheDocument(),
      );
      expect(requested).toBe(false);
    });

    it("cancels the in-flight handshake when the panel unmounts", async () => {
      const user = userEvent.setup();
      let aborted = false;
      server.use(
        http.post(HANDSHAKE_ENDPOINT, async ({ request }) => {
          // Resolve only once the client aborts, so the test can observe cancellation.
          await new Promise<void>((resolve) => {
            request.signal.addEventListener("abort", () => {
              aborted = true;
              resolve();
            });
          });
          return HttpResponse.json({ success: true, latencyMs: 1 });
        }),
      );
      const { unmount } = render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      unmount();

      await waitFor(() => expect(aborted).toBe(true));
    });

    it("runs a handshake even when an invalid HTTP body was typed in HTTP mode", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: true,
            latencyMs: 12,
            negotiationPath: "server_discover",
            protocolVersion: "2026-07-28",
            serverName: "git-server",
            serverVersion: "1.2.3",
            capabilities: { tools: {} },
            componentCounts: { tools: 1 },
            countsPartial: false,
            credentialSource: "none",
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      // Only HTTP mode validates the body, and the handshake payload never
      // carries one — leftover invalid JSON must not be parsed on this path.
      await user.click(screen.getByRole("radio", { name: "Post" }));
      await user.type(screen.getByLabelText(/body/i), "not json");

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText(/handshake succeeded/i)).toBeInTheDocument();
      });
    });

    it("labels the mode dropdown and reflects the selected mode", async () => {
      const user = userEvent.setup();
      render(<TestConnectionPanel {...defaultProps} />);

      const modeSelect = screen.getByRole("combobox", { name: /test type/i });
      expect(modeSelect).toHaveTextContent(/http request/i);

      await selectHandshakeMode(user);

      expect(modeSelect).toHaveTextContent(/mcp handshake/i);
    });

    it("shows a Cancel button during a handshake and aborts on click", async () => {
      const user = userEvent.setup();
      let aborted = false;
      server.use(
        http.post(HANDSHAKE_ENDPOINT, async ({ request }) => {
          // Resolve only once the client aborts, so the test can observe cancellation.
          await new Promise<void>((resolve) => {
            request.signal.addEventListener("abort", () => {
              aborted = true;
              resolve();
            });
          });
          return HttpResponse.json({ success: true, latencyMs: 1 });
        }),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await user.click(await screen.findByRole("button", { name: /^cancel$/i }));

      await waitFor(() => expect(aborted).toBe(true));
      expect(screen.getByText(/run a test to see the response/i)).toBeInTheDocument();
    });

    it("renders the raw response preview and copies it", async () => {
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: true,
            latencyMs: 12,
            negotiationPath: "initialize",
            credentialSource: "none",
            rawPreview: '{"result":{"ok":true}}',
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText(/raw response \(truncated\)/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /copy response body/i }));

      expect(writeText).toHaveBeenCalledWith(JSON.stringify({ result: { ok: true } }, null, 2));
    });

    it("labels stored credentials as the credential source", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: true,
            latencyMs: 8,
            negotiationPath: "initialize",
            credentialSource: "stored",
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText("Stored server credentials")).toBeInTheDocument();
      });
    });

    it("labels form headers as the credential source", async () => {
      const user = userEvent.setup();
      server.use(
        http.post(HANDSHAKE_ENDPOINT, () =>
          HttpResponse.json({
            success: true,
            latencyMs: 8,
            negotiationPath: "initialize",
            credentialSource: "form",
          }),
        ),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => {
        expect(screen.getByText("Form headers")).toBeInTheDocument();
      });
    });

    it("forwards a non-empty path in the handshake payload", async () => {
      const user = userEvent.setup();
      let requestBody: Record<string, unknown> | undefined;
      server.use(
        http.post(HANDSHAKE_ENDPOINT, async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ success: true, latencyMs: 1, credentialSource: "none" });
        }),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.type(screen.getByLabelText(/^path/i), "/mcp");
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => expect(requestBody).toBeDefined());
      expect(requestBody).toEqual(expect.objectContaining({ path: "/mcp" }));
    });

    it("forwards headers as a JSON object in the handshake payload", async () => {
      const user = userEvent.setup();
      let requestBody: Record<string, unknown> | undefined;
      server.use(
        http.post(HANDSHAKE_ENDPOINT, async ({ request }) => {
          requestBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ success: true, latencyMs: 1, credentialSource: "form" });
        }),
      );
      render(<TestConnectionPanel {...defaultProps} />);

      await selectHandshakeMode(user);
      await user.click(screen.getByLabelText(/headers/i));
      await user.paste('{"X-Api-Key": "k"}');
      await user.click(screen.getByRole("button", { name: /^test connection$/i }));

      await waitFor(() => expect(requestBody).toBeDefined());
      expect(requestBody?.headers).toEqual({ "X-Api-Key": "k" });
    });
  });
});
