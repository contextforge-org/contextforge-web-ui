import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth/AuthContext", () => ({
  useAuthContext: () => ({
    user: { email: "test@example.com", is_admin: true, is_active: true },
    isAuthenticated: true,
    isLoading: false,
    selectedTeamId: null,
    login: vi.fn(),
    logout: vi.fn(),
    setSelectedTeamId: vi.fn(),
    hasPermission: () => true,
    permissionsLoading: false,
  }),
}));

import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { renderWithProviders } from "@/test/test-utils";
import { ConnectAgentForm } from "./ConnectAgentForm";
import type { FetchCardResult, SuggestedAgent } from "@/types/agentCard";

const CARD_URL = "https://agent.example.com";
const URL_PLACEHOLDER = "Add URL for a running agent...";
const CARD_UNAVAILABLE = "Agent card not available: add the details for a running agent manually.";
const CARD_AUTH_REQUIRED =
  "The agent needs credentials to share its card: add the details for the agent manually.";
const CARD_UNREACHABLE =
  "Couldn't reach the agent: check the URL, or add the details for a running agent manually.";
const CARD_ERROR = "Couldn't read the agent card: add the details for a running agent manually.";
const TAG_PLACEHOLDER = "Add a tag";
const NAME_PLACEHOLDER = "Add an agent name";
const ENDPOINT_PLACEHOLDER = "https://agents.example.com/a2a";

function foundResult(suggested: SuggestedAgent = {}, warnings: string[] = []): FetchCardResult {
  return {
    found: true,
    outcome: "found",
    sourceUrl: `${CARD_URL}/.well-known/agent-card.json`,
    detectedVersion: "1.0",
    card: {
      name: "Visual Router",
      description: "Routes briefs to vendors.",
      version: "1.1.0",
      supportedInterfaces: [
        {
          url: "https://agent.example.com/rpc",
          protocolBinding: "JSONRPC",
          protocolVersion: "1.0",
        },
        {
          url: "https://agent.example.com/http",
          protocolBinding: "HTTP+JSON",
          protocolVersion: "1.0",
        },
      ],
      skills: [
        { id: "fit", name: "Vendor-fit routing" },
        { id: "hybrid", name: "Hybrid production routing" },
      ],
      securitySchemes: { bearerAuth: { httpAuthSecurityScheme: { scheme: "bearer" } } },
      securityRequirements: [{ schemes: { bearerAuth: {} } }],
    },
    suggestedAgent: {
      name: "Visual Router",
      description: "Routes briefs to vendors.",
      endpoint_url: "https://agent.example.com/rpc",
      protocol_version: "1.0",
      version: "1.1.0",
      capabilities: { streaming: false, skills: [] },
      ...suggested,
    },
    warnings,
  };
}

function mockFetchCard(result: FetchCardResult | (() => Response)) {
  server.use(
    http.post("/api/v1/a2a/fetch-card", () =>
      typeof result === "function" ? result() : HttpResponse.json(result),
    ),
  );
}

/** Captures the body of POST /api/v1/a2a. */
function mockCreate(
  respond: () => Response = () =>
    HttpResponse.json({ id: "a1", name: "Visual Router" }, { status: 201 }),
) {
  const captured: { body?: Record<string, unknown>; count: number } = { count: 0 };
  server.use(
    http.post("/api/v1/a2a", async ({ request }) => {
      captured.count += 1;
      captured.body = (await request.json()) as Record<string, unknown>;
      return respond();
    }),
  );
  return captured;
}

async function submitUrl(user: ReturnType<typeof userEvent.setup>, url = CARD_URL) {
  await user.type(await screen.findByPlaceholderText(URL_PLACEHOLDER), url);
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("ConnectAgentForm", () => {
  const onCancel = vi.fn();
  const onCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup() {
    renderWithProviders(<ConnectAgentForm onCancel={onCancel} onCreated={onCreated} />);
    return userEvent.setup();
  }

  describe("URL step", () => {
    it("rejects a value that is not an http(s) URL without calling the API", async () => {
      let fetched = false;
      server.use(
        http.post("/api/v1/a2a/fetch-card", () => {
          fetched = true;
          return HttpResponse.json({});
        }),
      );
      const user = setup();

      await submitUrl(user, "ftp://agent.example.com");

      expect(await screen.findByText("Enter a valid http or https URL.")).toBeInTheDocument();
      expect(fetched).toBe(false);
    });

    it("sends the trimmed URL as baseUrl", async () => {
      let body: unknown;
      server.use(
        http.post("/api/v1/a2a/fetch-card", async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(foundResult());
        }),
      );
      const user = setup();

      await submitUrl(user, `  ${CARD_URL}  `);

      await screen.findByText("Visual Router");
      expect(body).toEqual({ baseUrl: CARD_URL });
    });

    it.each([
      [
        "no card is published",
        () => HttpResponse.json({ found: false, outcome: "no_card" }),
        CARD_UNAVAILABLE,
      ],
      [
        "credentials are needed to read it",
        () => HttpResponse.json({ found: false, outcome: "auth_required", authScheme: "Bearer" }),
        CARD_AUTH_REQUIRED,
      ],
      [
        "the agent is unreachable",
        () => HttpResponse.json({ found: false, outcome: "unreachable" }),
        CARD_UNREACHABLE,
      ],
      [
        "the request is refused",
        () => HttpResponse.json({ detail: "Insufficient permissions" }, { status: 403 }),
        CARD_ERROR,
      ],
      [
        "the gateway errors",
        () => HttpResponse.json({ detail: "boom" }, { status: 500 }),
        CARD_ERROR,
      ],
    ])("says why and opens manual entry when %s", async (_name, respond, message) => {
      mockFetchCard(respond);
      const user = setup();

      await submitUrl(user);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Enter manually" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toBeVisible();
      expect(screen.queryByText("Visual Router")).not.toBeInTheDocument();
      // The server's own wording is not shown.
      expect(screen.queryByText("Insufficient permissions")).not.toBeInTheDocument();
    });

    it("treats a found outcome without a card like no card", async () => {
      mockFetchCard({ found: true, outcome: "found" });
      const user = setup();

      await submitUrl(user);

      expect(await screen.findByText(CARD_UNAVAILABLE)).toBeInTheDocument();
    });

    it("puts manual entry away when the URL is corrected, so Connect reads the card again", async () => {
      mockFetchCard({ found: false, outcome: "no_card" });
      const user = setup();

      await submitUrl(user);
      await screen.findByText(CARD_UNAVAILABLE);
      await user.type(screen.getByPlaceholderText(URL_PLACEHOLDER), "/x");

      expect(screen.queryByText(CARD_UNAVAILABLE)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Enter manually" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    });

    it("reads the card again after the URL is corrected", async () => {
      let calls = 0;
      mockFetchCard(() => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ found: false, outcome: "no_card" })
          : HttpResponse.json(foundResult());
      });
      const user = setup();

      await submitUrl(user);
      await screen.findByText(CARD_UNAVAILABLE);
      await user.type(screen.getByPlaceholderText(URL_PLACEHOLDER), "/x");
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByText("Visual Router")).toBeInTheDocument();
      expect(calls).toBe(2);
    });

    it("keeps manual entry open when the URL is edited after details were typed there", async () => {
      mockFetchCard({ found: false, outcome: "no_card" });
      const user = setup();

      await submitUrl(user);
      await screen.findByText(CARD_UNAVAILABLE);
      await user.type(screen.getByPlaceholderText(NAME_PLACEHOLDER), "Echo");
      await user.type(screen.getByPlaceholderText(URL_PLACEHOLDER), "/x");

      expect(screen.queryByText(CARD_UNAVAILABLE)).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue("Echo");
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    });

    it("leaves the form from Cancel and from Back", async () => {
      const user = setup();

      await user.click(await screen.findByRole("button", { name: "Cancel" }));
      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(onCancel).toHaveBeenCalledTimes(2);
    });
  });

  describe("review step", () => {
    it("shows what the card declares", async () => {
      mockFetchCard(foundResult());
      const user = setup();

      await submitUrl(user);

      expect(await screen.findByText("Visual Router")).toBeInTheDocument();
      expect(screen.getByText("agent v1.1.0")).toBeInTheDocument();
      expect(screen.getByText("Routes briefs to vendors.")).toBeInTheDocument();
      expect(screen.getByText("Skills (2)")).toBeInTheDocument();
      expect(screen.getByText("Vendor-fit routing")).toBeInTheDocument();
      expect(screen.getByText("A2A v1.0")).toBeInTheDocument();
      expect(screen.getByText("agent.example.com")).toBeInTheDocument();
      expect(screen.getByText("JSONRPC 1.0 (preferred), HTTP+JSON 1.0")).toBeInTheDocument();
      expect(screen.getByText("bearer")).toBeInTheDocument();
    });

    it("lists the card's warnings under View more", async () => {
      mockFetchCard(
        foundResult({}, ["Security scheme 'oauth' is an alternative that was not selected."]),
      );
      const user = setup();

      await submitUrl(user);
      await user.click(await screen.findByRole("button", { name: "View more" }));

      expect(
        await screen.findByText("Security scheme 'oauth' is an alternative that was not selected."),
      ).toBeInTheDocument();
    });

    it("goes back to the URL step with the URL kept", async () => {
      mockFetchCard(foundResult());
      const user = setup();

      await submitUrl(user);
      await screen.findByText("Visual Router");
      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(await screen.findByPlaceholderText(URL_PLACEHOLDER)).toHaveValue(CARD_URL);
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe("authenticate step", () => {
    async function toAuthStep(user: ReturnType<typeof userEvent.setup>) {
      await submitUrl(user);
      await user.click(await screen.findByRole("button", { name: "Continue" }));
    }

    it("registers a bearer agent with the key, defaulting to internal visibility", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      expect(await screen.findByText("Authenticate agent")).toBeInTheDocument();
      await user.type(screen.getByLabelText(/Bearer token/i), "s3cret");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(created.body).toEqual({
        agent: expect.objectContaining({
          name: "Visual Router",
          endpoint_url: "https://agent.example.com/rpc",
          protocol_version: "1.0",
          auth_type: "bearer",
          auth_token: "s3cret",
        }),
        visibility: "public",
      });
    });

    it("blocks registration until the required credentials are entered", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      await user.click(await screen.findByRole("button", { name: "Connect" }));

      expect(
        await screen.findByText("Enter the credentials the agent requires."),
      ).toBeInTheDocument();
      expect(created.count).toBe(0);
    });

    it("sends username and password for basic auth", async () => {
      mockFetchCard(foundResult({ auth_type: "basic" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      await user.type(await screen.findByLabelText(/Username/i), "alice");
      await user.type(screen.getByLabelText(/Password/i), "pw");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((created.body?.agent as Record<string, unknown>).auth_username).toBe("alice");
      expect((created.body?.agent as Record<string, unknown>).auth_password).toBe("pw");
    });

    it("prefills the header name for an API key sent in a header", async () => {
      mockFetchCard(foundResult({ auth_type: "authheaders", auth_header_key: "X-API-Key" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      expect(await screen.findByDisplayValue("X-API-Key")).toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("Add header value..."), "k-123");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((created.body?.agent as Record<string, unknown>).auth_headers).toEqual([
        { key: "X-API-Key", value: "k-123" },
      ]);
    });

    it("needs no credentials when the card declares none", async () => {
      mockFetchCard(foundResult({ auth_type: null }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      expect(await screen.findByText("Agent settings")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      const agent = created.body?.agent as Record<string, unknown>;
      expect(agent).not.toHaveProperty("auth_token");
      expect(agent).not.toHaveProperty("auth_password");
    });

    it("cannot register an OAuth 2.0 agent from this form", async () => {
      mockFetchCard(
        foundResult({ auth_type: "oauth", oauth_config: { grant_type: "client_credentials" } }),
      );
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);

      expect(
        await screen.findByText(/uses OAuth 2.0, which can't be set up from this form yet/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
      expect(created.count).toBe(0);
    });

    it("sends the chosen visibility", async () => {
      mockFetchCard(foundResult({ auth_type: null }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      await user.click(await screen.findByRole("combobox", { name: /Visibility/ }));
      await user.click(await screen.findByRole("option", { name: "Private" }));
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(created.body?.visibility).toBe("private");
      expect(created.body).not.toHaveProperty("team_id");
    });

    it("keeps the form and shows the server's reason when registration fails", async () => {
      mockFetchCard(foundResult({ auth_type: null }));
      mockCreate(() => HttpResponse.json({ detail: "Agent name already exists" }, { status: 409 }));
      const user = setup();

      await toAuthStep(user);
      await user.click(await screen.findByRole("button", { name: "Connect" }));

      expect(await screen.findByText("Agent name already exists")).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
    });
  });
  describe("manual entry", () => {
    async function openManual(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole("button", { name: "Enter manually" }));
      await screen.findByPlaceholderText(NAME_PLACEHOLDER);
    }

    async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByPlaceholderText(NAME_PLACEHOLDER), "Echo agent");
      await user.type(screen.getByPlaceholderText(ENDPOINT_PLACEHOLDER), "http://127.0.0.1:9100");
    }

    const agentOf = (created: { body?: Record<string, unknown> }) =>
      created.body?.agent as Record<string, unknown>;

    it("is collapsed until expanded", async () => {
      const user = setup();

      const toggle = await screen.findByRole("button", { name: "Enter manually" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByPlaceholderText(NAME_PLACEHOLDER)).not.toBeInTheDocument();

      await user.click(toggle);

      expect(await screen.findByPlaceholderText(NAME_PLACEHOLDER)).toBeVisible();
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
    });

    it("registers an agent from just a name and an endpoint, without reading a card", async () => {
      let fetched = false;
      server.use(
        http.post("/api/v1/a2a/fetch-card", () => {
          fetched = true;
          return HttpResponse.json({});
        }),
      );
      const created = mockCreate();
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(fetched).toBe(false);
      expect(created.body).toEqual({
        agent: {
          name: "Echo agent",
          endpoint_url: "http://127.0.0.1:9100",
          protocol_version: "1.0",
        },
        visibility: "public",
      });
    });

    it("needs a name and a valid endpoint, and does not register until both are given", async () => {
      const created = mockCreate();
      const user = setup();

      await openManual(user);
      await user.type(screen.getByPlaceholderText(ENDPOINT_PLACEHOLDER), "ftp://nope");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      expect(await screen.findByText("Enter a name for the agent.")).toBeInTheDocument();
      expect(screen.getByText("Enter a valid http or https endpoint URL.")).toBeInTheDocument();
      expect(created.count).toBe(0);
    });

    it("does not need the card URL", async () => {
      const created = mockCreate();
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      expect(screen.getByPlaceholderText(URL_PLACEHOLDER)).toHaveValue("");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(created.count).toBe(1));
    });

    it("sends the optional description and tags, trimming and de-duplicating the tags", async () => {
      const created = mockCreate();
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      await user.type(screen.getByPlaceholderText(TAG_PLACEHOLDER), " testing, echo ,, Testing ");
      await user.type(
        screen.getByPlaceholderText("Add an optional description..."),
        "  Echoes text back  ",
      );
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(agentOf(created)).toMatchObject({
        description: "Echoes text back",
        tags: ["testing", "echo"],
      });
    });

    it("leaves description and tags out when they are blank", async () => {
      const created = mockCreate();
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      await user.type(screen.getByPlaceholderText(TAG_PLACEHOLDER), " , ");
      await user.type(screen.getByPlaceholderText("Add an optional description..."), "   ");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(agentOf(created)).not.toHaveProperty("description");
      expect(agentOf(created)).not.toHaveProperty("tags");
    });

    it("labels the description for screen readers", async () => {
      const user = setup();

      await openManual(user);

      expect(screen.getByLabelText("Description")).toBe(
        screen.getByPlaceholderText("Add an optional description..."),
      );
    });

    it("sends the chosen protocol version", async () => {
      const created = mockCreate();
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      await user.click(screen.getByRole("radio", { name: "A2A 0.3" }));
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(agentOf(created).protocol_version).toBe("0.3");
    });

    it("offers JSON-RPC only, since HTTP+JSON is not supported yet", async () => {
      const user = setup();

      await openManual(user);

      expect(screen.getByRole("radio", { name: "JSON-RPC" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "HTTP+JSON" })).toBeDisabled();
    });

    it("sends the chosen visibility", async () => {
      const created = mockCreate();
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      await user.click(screen.getByRole("combobox", { name: /Visibility/ }));
      await user.click(await screen.findByRole("option", { name: "Private" }));
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(created.body?.visibility).toBe("private");
    });

    describe("authentication", () => {
      it("starts on None and sends no credentials", async () => {
        const created = mockCreate();
        const user = setup();

        await openManual(user);
        expect(screen.getByRole("radio", { name: "None" })).toBeChecked();
        await fillRequired(user);
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(agentOf(created)).not.toHaveProperty("auth_type");
      });

      it("sends a bearer token, and needs it", async () => {
        const created = mockCreate();
        const user = setup();

        await openManual(user);
        await fillRequired(user);
        await user.click(screen.getByRole("radio", { name: "Bearer token" }));
        await user.click(screen.getByRole("button", { name: "Connect" }));
        expect(await screen.findByText("Enter the credentials the agent requires.")).toBeVisible();
        expect(created.count).toBe(0);

        await user.type(screen.getByPlaceholderText("Paste bearer token..."), "s3cret");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(agentOf(created)).toMatchObject({ auth_type: "bearer", auth_token: "s3cret" });
      });

      it("sends basic credentials", async () => {
        const created = mockCreate();
        const user = setup();

        await openManual(user);
        await fillRequired(user);
        await user.click(screen.getByRole("radio", { name: "Basic" }));
        await user.type(screen.getByLabelText(/Username/i), "alice");
        await user.type(screen.getByLabelText(/Password/i), "pw");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(agentOf(created)).toMatchObject({
          auth_type: "basic",
          auth_username: "alice",
          auth_password: "pw", // pragma: allowlist secret
        });
      });

      it("starts custom headers with one empty row and sends the header", async () => {
        const created = mockCreate();
        const user = setup();

        await openManual(user);
        await fillRequired(user);
        await user.click(screen.getByRole("radio", { name: "Custom headers" }));
        await user.type(screen.getByPlaceholderText("e.g. X-API-Key..."), "X-API-Key");
        await user.type(screen.getByPlaceholderText("Add header value..."), "k-123");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(agentOf(created)).toMatchObject({
          auth_type: "authheaders",
          auth_headers: [{ key: "X-API-Key", value: "k-123" }],
        });
      });

      it("sends a query parameter key", async () => {
        const created = mockCreate();
        const user = setup();

        await openManual(user);
        await fillRequired(user);
        await user.click(screen.getByRole("radio", { name: "Query parameter" }));
        await user.type(screen.getByPlaceholderText("e.g. api_key..."), "api_key");
        await user.type(screen.getByPlaceholderText("e.g. a1b2c3d4e5f6789..."), "k-123");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(agentOf(created)).toMatchObject({
          auth_type: "query_param",
          auth_query_param_key: "api_key",
          auth_query_param_value: "k-123",
        });
      });

      it("sends an OAuth 2.0 client-credentials configuration", async () => {
        const created = mockCreate();
        const user = setup();

        await openManual(user);
        await fillRequired(user);
        await user.click(screen.getByRole("radio", { name: "OAuth 2.0" }));
        await user.type(screen.getByLabelText(/Token URL/), "https://auth.example.com/token");
        await user.type(screen.getByLabelText(/Client ID/), "client-1");
        await user.type(screen.getByLabelText(/Client secret/), "shh");
        await user.type(screen.getByLabelText("Scopes"), "read, write");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(agentOf(created)).toMatchObject({
          auth_type: "oauth",
          oauth_config: {
            grant_type: "client_credentials",
            client_id: "client-1",
            client_secret: "shh", // pragma: allowlist secret
            token_url: "https://auth.example.com/token",
            scopes: ["read", "write"],
          },
        });
      });

      it("sends only the credentials of the tab that is selected", async () => {
        const created = mockCreate();
        const user = setup();

        await openManual(user);
        await fillRequired(user);
        await user.click(screen.getByRole("radio", { name: "Bearer token" }));
        await user.type(screen.getByPlaceholderText("Paste bearer token..."), "s3cret");
        await user.click(screen.getByRole("radio", { name: "None" }));
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(agentOf(created)).not.toHaveProperty("auth_token");
      });
    });

    it("keeps the form and shows the server's reason when registration fails", async () => {
      mockCreate(() => HttpResponse.json({ detail: "Agent name already exists" }, { status: 409 }));
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      await user.click(screen.getByRole("button", { name: "Connect" }));

      expect(await screen.findByText("Agent name already exists")).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
    });

    it("can be used after the card could not be read", async () => {
      mockFetchCard({ found: false, outcome: "no_card" });
      const created = mockCreate();
      const user = setup();

      await submitUrl(user);
      await screen.findByText(CARD_UNAVAILABLE);
      await fillRequired(user);
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(agentOf(created)).toMatchObject({ name: "Echo agent" });
    });
  });
});
