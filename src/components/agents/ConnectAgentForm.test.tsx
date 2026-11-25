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
const CARD_AUTH_REQUIRED = "Enter a credential to view this agent's card.";
const CARD_CREDENTIAL_REJECTED = "Invalid credential. Check it and try again.";
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
      provider: { organization: "Objekts Developers", url: "https://objekts.ai/about" },
      capabilities: { streaming: true, extensions: [{ uri: "https://x.example/ext" }] },
      defaultInputModes: ["text", "application/pdf"],
      defaultOutputModes: ["text", "application/json"],
      skills: [
        {
          id: "fit",
          name: "Vendor-fit routing",
          description: "Matches briefs to vendors",
          outputModes: ["text/plain"],
        },
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

/** A card that declares no security, so there are no credentials to ask for. */
function openResult(suggested: SuggestedAgent = {}): FetchCardResult {
  const result = foundResult({ auth_type: null, ...suggested });
  result.card = { ...result.card!, securitySchemes: {}, securityRequirements: [] };
  return result;
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

    describe("a card behind authentication", () => {
      function mockAuthGated(accept: string | null) {
        const seen: Array<Record<string, string> | undefined> = [];
        server.use(
          http.post("/api/v1/a2a/fetch-card", async ({ request }) => {
            const body = (await request.json()) as { headers?: Record<string, string> };
            seen.push(body.headers);
            if (accept && body.headers?.Authorization === `Bearer ${accept}`) {
              return HttpResponse.json(foundResult({ auth_type: "bearer" }));
            }
            return HttpResponse.json({
              found: false,
              outcome: "auth_required",
              authScheme: "Bearer",
            });
          }),
        );
        return seen;
      }

      it("asks for a credential on the URL step and fetches again with it", async () => {
        const seen = mockAuthGated("good");
        const user = setup();

        await submitUrl(user);
        expect(await screen.findByText(CARD_AUTH_REQUIRED)).toBeInTheDocument();

        await user.type(screen.getByLabelText(/Credential/), "good");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByText("Visual Router")).toBeInTheDocument();
        expect(seen).toEqual([undefined, { Authorization: "Bearer good" }]);
      });

      it("does not ask again at registration for a credential that worked", async () => {
        mockAuthGated("good");
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        await user.type(await screen.findByLabelText(/Credential/), "good");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await user.click(await screen.findByRole("button", { name: "Continue" }));

        expect(await screen.findByText("Authenticate agent")).toBeInTheDocument();
        expect(screen.queryByLabelText(/^Key/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(created.count).toBe(1));
        const agent = created.body!.agent as Record<string, unknown>;
        expect(agent.auth_token).toBe("good");
        // The gateway cannot read this card again without the credential, so it is not asked to.
        expect(agent).not.toHaveProperty("card_url");
      });

      it("does not send the card URL when the agent then uses OAuth, which sends no card header", async () => {
        server.use(
          http.post("/api/v1/a2a/fetch-card", async ({ request }) => {
            const body = (await request.json()) as { headers?: Record<string, string> };
            if (body.headers?.Authorization === "Bearer good") {
              return HttpResponse.json(
                foundResult({
                  auth_type: "oauth",
                  oauth_config: {
                    grant_type: "client_credentials",
                    token_url: "https://agent.example.com/token",
                  },
                }),
              );
            }
            return HttpResponse.json({
              found: false,
              outcome: "auth_required",
              authScheme: "Bearer",
            });
          }),
        );
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        await user.type(await screen.findByLabelText(/Credential/), "good");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await user.click(await screen.findByRole("button", { name: "Continue" }));
        await user.type(await screen.findByLabelText(/Client ID/), "cid");
        await user.type(screen.getByLabelText(/Client secret/), "shh");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(created.count).toBe(1));
        const agent = created.body!.agent as Record<string, unknown>;
        expect(agent.auth_type).toBe("oauth");
        expect(agent).not.toHaveProperty("card_url");
      });

      it("asks again at registration when the card points to a different site", async () => {
        server.use(
          http.post("/api/v1/a2a/fetch-card", async ({ request }) => {
            const body = (await request.json()) as { headers?: Record<string, string> };
            if (body.headers?.Authorization === "Bearer good") {
              return HttpResponse.json(
                foundResult({ auth_type: "bearer", endpoint_url: "https://evil.example.net/rpc" }),
              );
            }
            return HttpResponse.json({
              found: false,
              outcome: "auth_required",
              authScheme: "Bearer",
            });
          }),
        );
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        await user.type(await screen.findByLabelText(/Credential/), "good");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await user.click(await screen.findByRole("button", { name: "Continue" }));

        expect(await screen.findByText("Authenticate agent")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Add key from the agent provider")).toHaveValue("");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        expect(created.count).toBe(0);
      });

      it("does not send the card URL when the card points to a different site", async () => {
        server.use(
          http.post("/api/v1/a2a/fetch-card", async ({ request }) => {
            const body = (await request.json()) as { headers?: Record<string, string> };
            if (body.headers?.Authorization === "Bearer good") {
              return HttpResponse.json(
                foundResult({ auth_type: "bearer", endpoint_url: "https://api.example.net/rpc" }),
              );
            }
            return HttpResponse.json({
              found: false,
              outcome: "auth_required",
              authScheme: "Bearer",
            });
          }),
        );
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        await user.type(await screen.findByLabelText(/Credential/), "good");
        await user.click(screen.getByRole("button", { name: "Continue" }));
        await user.click(await screen.findByRole("button", { name: "Continue" }));
        await user.type(
          await screen.findByPlaceholderText("Add key from the agent provider"),
          "agent-key",
        );
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(created.count).toBe(1));
        const agent = created.body!.agent as Record<string, unknown>;
        expect(agent.auth_token).toBe("agent-key");
        expect(agent).not.toHaveProperty("card_url");
      });

      it("reports a rejected credential and keeps the URL and credential", async () => {
        mockAuthGated("good");
        const user = setup();

        await submitUrl(user);
        await user.type(await screen.findByLabelText(/Credential/), "bad");
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(await screen.findByText(CARD_CREDENTIAL_REJECTED)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(URL_PLACEHOLDER)).toHaveValue(CARD_URL);
        expect(screen.getByLabelText(/Credential/)).toHaveValue("bad");
        expect(screen.queryByText(CARD_UNAVAILABLE)).not.toBeInTheDocument();
      });

      it("drops the credential when the URL changes", async () => {
        mockAuthGated("good");
        const user = setup();

        await submitUrl(user);
        await screen.findByLabelText(/Credential/);
        await user.type(screen.getByPlaceholderText(URL_PLACEHOLDER), "/other");

        expect(screen.queryByLabelText(/Credential/)).not.toBeInTheDocument();
      });
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
      expect(screen.getByText("JSON-RPC (preferred), HTTP+JSON")).toBeInTheDocument();
      expect(screen.getByText("bearer")).toBeInTheDocument();
    });

    it("says the card is signed when it carries a signature", async () => {
      const result = foundResult();
      result.card!.signatures = [{ protected: "p", signature: "abc" }];
      mockFetchCard(result);
      const user = setup();

      await submitUrl(user);

      expect(await screen.findByText("signed")).toBeInTheDocument();
    });

    it("opens the rest of the card under View more", async () => {
      mockFetchCard(foundResult({ auth_type: "authheaders", auth_header_key: "X-API-Key" }));
      const user = setup();

      await submitUrl(user);
      await user.click(await screen.findByRole("button", { name: "View more" }));

      expect(await screen.findByDisplayValue("Visual Router")).toBeInTheDocument();
      expect(screen.getByText("Agent requires bearer")).toBeInTheDocument();
      expect(screen.getByText("Header name")).toBeInTheDocument();
      expect(screen.getByText("X-API-Key")).toBeInTheDocument();
      expect(screen.getByText("Publisher")).toBeInTheDocument();
      expect(screen.getByText("Objekts Developers")).toBeInTheDocument();
      expect(screen.getByText("objekts.ai")).toBeInTheDocument();
      expect(screen.getByText("agent.example.com/rpc")).toBeInTheDocument();
      expect(screen.getByText("agent.example.com/http")).toBeInTheDocument();
      expect(screen.getByText("Capabilities")).toBeInTheDocument();
      expect(screen.getAllByText("yes")).toHaveLength(2);
      expect(screen.getByText("text, application/pdf")).toBeInTheDocument();
      expect(screen.getByText("Matches briefs to vendors")).toBeInTheDocument();
      expect(screen.getByText("text/plain")).toBeInTheDocument();
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

    it("lets the user change the name the agent is registered under", async () => {
      mockFetchCard(openResult());
      const created = mockCreate();
      const user = setup();

      await submitUrl(user);
      await user.click(await screen.findByRole("button", { name: "View more" }));
      const name = await screen.findByDisplayValue("Visual Router");
      await user.clear(name);
      await user.type(name, "objekts_visual_router");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(await screen.findByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((created.body?.agent as Record<string, unknown>).name).toBe("objekts_visual_router");
    });

    it("needs a name, and opens View more to show the problem", async () => {
      mockFetchCard(openResult());
      const created = mockCreate();
      const user = setup();

      await submitUrl(user);
      await user.click(await screen.findByRole("button", { name: "View more" }));
      await user.clear(await screen.findByDisplayValue("Visual Router"));
      await user.click(screen.getByRole("button", { name: "View more" }));
      expect(screen.queryByText("Enter a name for the agent.")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Continue" }));

      expect(await screen.findByText("Enter a name for the agent.")).toBeInTheDocument();
      expect(created.count).toBe(0);
    });

    describe("Continue", () => {
      it("goes on to the authenticate page when the card needs credentials", async () => {
        mockFetchCard(foundResult({ auth_type: "bearer" }));
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        await user.click(await screen.findByRole("button", { name: "Continue" }));

        expect(await screen.findByText("Authenticate agent")).toBeInTheDocument();
        expect(created.count).toBe(0);
      });

      it("still asks for visibility, without a Key field, when the card needs no credentials", async () => {
        mockFetchCard(openResult());
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
        await user.click(await screen.findByRole("button", { name: "Continue" }));

        expect(await screen.findByText("Set agent visibility")).toBeInTheDocument();
        expect(screen.getByText("Choose who can access this agent.")).toBeInTheDocument();
        expect(screen.queryByText("Authenticate agent")).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText("Add key from the agent provider")).toBeNull();
        expect(created.count).toBe(0);
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        expect(created.body).toEqual({
          agent: expect.objectContaining({
            name: "Visual Router",
            endpoint_url: "https://agent.example.com/rpc",
            protocol_version: "1.0",
            // The gateway fetches the card again from here, which is what stores it for the agent.
            card_url: `${CARD_URL}/.well-known/agent-card.json`,
          }),
          visibility: "public",
        });
        const agent = created.body?.agent as Record<string, unknown>;
        expect(agent).not.toHaveProperty("auth_token");
        expect(agent).not.toHaveProperty("tags");
      });

      it("shows the server's reason on the visibility page when that registration fails", async () => {
        mockFetchCard(openResult());
        mockCreate(() =>
          HttpResponse.json({ detail: "Agent name already exists" }, { status: 409 }),
        );
        const user = setup();

        await submitUrl(user);
        await user.click(await screen.findByRole("button", { name: "Continue" }));
        await user.click(await screen.findByRole("button", { name: "Connect" }));

        expect(await screen.findByText("Agent name already exists")).toBeInTheDocument();
        expect(onCreated).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
      });

      it("explains a card that gave no name or endpoint", async () => {
        const result = openResult();
        delete result.suggestedAgent!.endpoint_url;
        mockFetchCard(result);
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        await user.click(await screen.findByRole("button", { name: "Continue" }));
        await user.click(await screen.findByRole("button", { name: "Connect" }));

        expect(await screen.findByText(/missing a name or endpoint/)).toBeInTheDocument();
        expect(created.count).toBe(0);
      });
    });
  });

  describe("authenticate step", () => {
    async function toAuthStep(user: ReturnType<typeof userEvent.setup>) {
      await submitUrl(user);
      await user.click(await screen.findByRole("button", { name: "Continue" }));
      await screen.findByText("Authenticate agent");
    }

    it("registers a bearer agent with the key, defaulting to internal visibility", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      expect(screen.getByText("Key")).toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("Add key from the agent provider"), "s3cret");
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

    it("goes back to the review page", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const user = setup();

      await toAuthStep(user);
      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(await screen.findByText("Skills (2)")).toBeInTheDocument();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("blocks registration until the required key is entered", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      await user.click(screen.getByRole("button", { name: "Connect" }));

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

    it("asks only for the key when the card names the header, and sends it under that name", async () => {
      mockFetchCard(foundResult({ auth_type: "authheaders", auth_header_key: "X-API-Key" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      expect(screen.queryByDisplayValue("X-API-Key")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Add header value...")).not.toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("Add key from the agent provider"), "k-123");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((created.body?.agent as Record<string, unknown>).auth_headers).toEqual([
        { key: "X-API-Key", value: "k-123" },
      ]);
    });

    it("asks only for the key when the card names the query parameter", async () => {
      mockFetchCard(foundResult({ auth_type: "query_param", auth_query_param_key: "api_key" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      await user.type(screen.getByPlaceholderText("Add key from the agent provider"), "k-123");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(created.body?.agent).toMatchObject({
        auth_type: "query_param",
        auth_query_param_key: "api_key",
        auth_query_param_value: "k-123",
      });
    });

    it("asks for the header name too when the card does not give one", async () => {
      mockFetchCard(foundResult({ auth_type: "authheaders" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      expect(
        screen.queryByPlaceholderText("Add key from the agent provider"),
      ).not.toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("e.g. X-API-Key..."), "X-Key");
      await user.type(screen.getByPlaceholderText("Add header value..."), "k-123");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect((created.body?.agent as Record<string, unknown>).auth_headers).toEqual([
        { key: "X-Key", value: "k-123" },
      ]);
    });

    it("cannot register an agent whose card requires security the gateway can't map", async () => {
      // An mTLS requirement leaves `auth_type` empty, which must not read as "no security".
      const result = foundResult({ auth_type: null });
      result.card = {
        ...result.card!,
        securitySchemes: { mtls: { mtlsSecurityScheme: {} } },
        securityRequirements: [{ schemes: { mtls: {} } }],
      };
      mockFetchCard(result);
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);

      expect(
        await screen.findByText(/security requirements can't be set up from this form yet/),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
      expect(created.count).toBe(0);
    });

    describe("OAuth 2.0 card", () => {
      const oauthCard = (overrides: Record<string, unknown> = {}) =>
        foundResult(
          {
            auth_type: "oauth",
            oauth_config: {
              grant_type: "client_credentials",
              token_url: "https://agent.example.com/token",
              scopes: ["read", "write"],
            },
            ...overrides,
          },
          [
            "The card's OAuth token_url points to 'idp.other.com', which differs from the agent host.",
          ],
        );

      it("shows the card's token URL and scopes and sends oauth_config without a resource by default", async () => {
        mockFetchCard(oauthCard());
        const created = mockCreate();
        const user = setup();

        await toAuthStep(user);

        expect(await screen.findByText("https://agent.example.com/token")).toBeInTheDocument();
        expect(screen.getByText("read write")).toBeInTheDocument();
        expect(screen.getByText(/differs from the agent host/)).toBeInTheDocument();
        // Empty, with the agent's origin as the placeholder; the gateway applies it.
        expect(screen.getByLabelText("Resource")).toHaveValue("");
        expect(screen.getByLabelText("Resource")).toHaveAttribute(
          "placeholder",
          "https://agent.example.com",
        );

        await user.type(screen.getByLabelText(/Client ID/), "cid");
        await user.type(screen.getByLabelText(/Client secret/), "shh");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(created.count).toBe(1));
        const agent = created.body!.agent as Record<string, unknown>;
        expect(agent.auth_type).toBe("oauth");
        expect(agent.oauth_config).toEqual({
          grant_type: "client_credentials",
          client_id: "cid",
          client_secret: "shh", // pragma: allowlist secret
          token_url: "https://agent.example.com/token",
          scopes: ["read", "write"],
        });
      });

      it("sends the resource when one is entered", async () => {
        mockFetchCard(oauthCard());
        const created = mockCreate();
        const user = setup();

        await toAuthStep(user);
        await user.type(await screen.findByLabelText("Resource"), "https://api.example.com");
        await user.type(screen.getByLabelText(/Client ID/), "cid");
        await user.type(screen.getByLabelText(/Client secret/), "shh");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(created.count).toBe(1));
        const agent = created.body!.agent as { oauth_config: Record<string, unknown> };
        expect(agent.oauth_config.resource).toBe("https://api.example.com");
      });

      it("shows only the OAuth warnings on the authenticate step", async () => {
        mockFetchCard(
          foundResult(
            {
              auth_type: "oauth",
              oauth_config: { grant_type: "client_credentials", token_url: "http://a/t" },
            },
            [
              "The card's OAuth token_url uses 'http', not https. Verify it before entering a client secret.",
              "No JSONRPC interface is declared.",
            ],
          ),
        );
        const user = setup();

        await toAuthStep(user);

        expect(await screen.findByText(/token_url uses 'http', not https/)).toBeInTheDocument();
        expect(screen.queryByText(/No JSONRPC interface/)).not.toBeInTheDocument();
      });

      it("leaves resource out when it is left empty", async () => {
        mockFetchCard(oauthCard());
        const created = mockCreate();
        const user = setup();

        await toAuthStep(user);
        await screen.findByLabelText("Resource");
        await user.type(screen.getByLabelText(/Client ID/), "cid");
        await user.type(screen.getByLabelText(/Client secret/), "shh");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(created.count).toBe(1));
        const agent = created.body!.agent as { oauth_config: Record<string, unknown> };
        expect(agent.oauth_config).not.toHaveProperty("resource");
      });

      it("cannot register a card that only offers another OAuth flow", async () => {
        mockFetchCard(
          oauthCard({
            oauth_config: { grant_type: "authorization_code", token_url: "https://a/t" },
          }),
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

      it("cannot register a client-credentials card that names no token URL", async () => {
        mockFetchCard(
          oauthCard({ oauth_config: { grant_type: "client_credentials", token_url: null } }),
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
    });

    it("sends the chosen visibility", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      await user.type(screen.getByPlaceholderText("Add key from the agent provider"), "s3cret");
      await user.click(await screen.findByRole("combobox", { name: /Visibility/ }));
      await user.click(await screen.findByRole("option", { name: "Private" }));
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(created.body?.visibility).toBe("private");
      expect(created.body).not.toHaveProperty("team_id");
    });

    it("keeps tags and a description under View more, and sends them", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      expect(screen.queryByPlaceholderText(TAG_PLACEHOLDER)).not.toBeInTheDocument();
      await user.type(screen.getByPlaceholderText("Add key from the agent provider"), "s3cret");
      await user.click(screen.getByRole("button", { name: "View more" }));
      await user.type(
        await screen.findByPlaceholderText(TAG_PLACEHOLDER),
        "billing, internal ,Billing",
      );
      await user.type(
        screen.getByPlaceholderText("Add an optional description..."),
        "  Our own description ",
      );
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(created.body?.agent).toMatchObject({
        tags: ["billing", "internal"],
        description: "Our own description",
      });
    });

    it("keeps the card's description when none is entered", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      const created = mockCreate();
      const user = setup();

      await toAuthStep(user);
      await user.type(screen.getByPlaceholderText("Add key from the agent provider"), "s3cret");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      await waitFor(() => expect(onCreated).toHaveBeenCalled());
      expect(created.body?.agent).toMatchObject({ description: "Routes briefs to vendors." });
    });

    it("keeps the form and shows the server's reason when registration fails", async () => {
      mockFetchCard(foundResult({ auth_type: "bearer" }));
      mockCreate(() => HttpResponse.json({ detail: "Agent name already exists" }, { status: 409 }));
      const user = setup();

      await toAuthStep(user);
      await user.type(screen.getByPlaceholderText("Add key from the agent provider"), "s3cret");
      await user.click(screen.getByRole("button", { name: "Connect" }));

      expect(await screen.findByText("Agent name already exists")).toBeInTheDocument();
      expect(onCreated).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
    });

    it("drops the registration error when going back", async () => {
      mockFetchCard(openResult());
      mockCreate(() => HttpResponse.json({ detail: "Agent name already exists" }, { status: 409 }));
      const user = setup();

      await submitUrl(user);
      await user.click(await screen.findByRole("button", { name: "Continue" }));
      await user.click(await screen.findByRole("button", { name: "Connect" }));
      await screen.findByText("Agent name already exists");
      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(await screen.findByRole("button", { name: "Continue" })).toBeVisible();
      expect(screen.queryByText("Agent name already exists")).not.toBeInTheDocument();
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

      it("does not send a resource typed earlier in the card flow", async () => {
        mockFetchCard(
          foundResult({
            auth_type: "oauth",
            oauth_config: {
              grant_type: "client_credentials",
              token_url: "https://a.example.com/t",
            },
          }),
        );
        const created = mockCreate();
        const user = setup();

        await submitUrl(user);
        await user.click(await screen.findByRole("button", { name: "Continue" }));
        await user.type(await screen.findByLabelText("Resource"), "https://stale.example.com");
        await user.click(screen.getByRole("button", { name: "Back" }));
        await user.click(await screen.findByRole("button", { name: "Back" }));
        await openManual(user);
        await fillRequired(user);
        await user.click(screen.getByRole("radio", { name: "OAuth 2.0" }));
        await user.type(screen.getByLabelText(/Token URL/), "https://auth.example.com/token");
        await user.type(screen.getByLabelText(/Client ID/), "client-1");
        await user.type(screen.getByLabelText(/Client secret/), "shh");
        await user.click(screen.getByRole("button", { name: "Connect" }));

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        const agent = agentOf(created) as { oauth_config: Record<string, unknown> };
        expect(agent.oauth_config).not.toHaveProperty("resource");
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

    it("keeps showing the server's reason after manual entry is closed", async () => {
      mockCreate(() => HttpResponse.json({ detail: "Agent name already exists" }, { status: 409 }));
      const user = setup();

      await openManual(user);
      await fillRequired(user);
      await user.click(screen.getByRole("button", { name: "Connect" }));
      await screen.findByText("Agent name already exists");
      await user.click(screen.getByRole("button", { name: "Enter manually" }));

      expect(screen.getByText("Agent name already exists")).toBeInTheDocument();
    });

    it("does not mark the URL as required while manual entry is open", async () => {
      const user = setup();
      const urlLabel = () => screen.getByText("URL", { selector: "label" });

      expect(urlLabel()).toHaveTextContent("*");
      await openManual(user);
      expect(urlLabel()).not.toHaveTextContent("*");
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
