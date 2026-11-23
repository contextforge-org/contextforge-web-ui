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
import { EditAgentForm } from "./EditAgentForm";
import type { Agent } from "@/types/agent";

const NAME_PLACEHOLDER = "Add an agent name";
const ENDPOINT_PLACEHOLDER = "https://agents.example.com/a2a";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Alpha",
    slug: "alpha",
    description: "Answers questions",
    endpointUrl: "https://agent.example.com/a2a",
    agentType: "generic",
    protocolVersion: "1.0",
    capabilities: { streaming: true },
    config: {},
    enabled: true,
    reachable: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lastInteraction: null,
    tags: [{ label: "support" }],
    visibility: "public",
    authType: null,
    ...overrides,
  } as Agent;
}

/** Captures the body of the `PUT` the form sends, and answers with the agent as stored. */
function mockUpdate(agent: Agent, respond?: (body: Record<string, unknown>) => Response) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  server.use(
    http.put("/api/v1/a2a/:id", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.push({ url: new URL(request.url).pathname, body });
      return respond ? respond(body) : HttpResponse.json({ ...agent, ...body });
    }),
  );
  return calls;
}

function renderForm(agent: Agent, handlers: { onSaved?: () => void; onCancel?: () => void } = {}) {
  const onSaved = handlers.onSaved ?? vi.fn();
  const onCancel = handlers.onCancel ?? vi.fn();
  renderWithProviders(<EditAgentForm agent={agent} onSaved={onSaved} onCancel={onCancel} />);
  return { onSaved, onCancel, user: userEvent.setup() };
}

describe("EditAgentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts from the agent's current values", () => {
    renderForm(makeAgent());

    expect(screen.getByRole("heading", { name: "Edit Alpha" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue("Alpha");
    expect(screen.getByPlaceholderText(ENDPOINT_PLACEHOLDER)).toHaveValue(
      "https://agent.example.com/a2a",
    );
    expect(screen.getByText("Answers questions")).toBeInTheDocument();
    expect(screen.getByText("support")).toBeInTheDocument();
  });

  it("sends only the fields that changed", async () => {
    const agent = makeAgent();
    const calls = mockUpdate(agent);
    const { user, onSaved } = renderForm(agent);

    const name = screen.getByPlaceholderText(NAME_PLACEHOLDER);
    await user.clear(name);
    await user.type(name, "Beta");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/v1/a2a/agent-1");
    expect(calls[0].body).toEqual({ name: "Beta" });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: "Beta" }));
  });

  it("does not call the gateway when nothing was touched", async () => {
    const calls = mockUpdate(makeAgent());
    const { user, onSaved } = renderForm(makeAgent());

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
    expect(calls).toHaveLength(0);
  });

  it("shows the protocol binding and sends a new one", async () => {
    const agent = makeAgent({ protocolBinding: "jsonrpc" });
    const calls = mockUpdate(agent);
    const { user, onSaved } = renderForm(agent);

    expect(screen.getByRole("radio", { name: "JSON-RPC" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "HTTP+JSON" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: "HTTP+JSON" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0].body).toEqual({ protocol_binding: "http_json" });
  });

  it("selects an agent's stored HTTP+JSON binding", () => {
    renderForm(makeAgent({ protocolBinding: "http_json" }));
    expect(screen.getByRole("radio", { name: "HTTP+JSON" })).toBeChecked();
  });

  it("leaves the binding alone for an agent that has none set", async () => {
    const calls = mockUpdate(makeAgent({ protocolBinding: null }));
    const { user, onSaved } = renderForm(makeAgent({ protocolBinding: null }));

    expect(screen.getByRole("radio", { name: "JSON-RPC" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
    expect(calls).toHaveLength(0);
  });

  it("never sends capabilities or skills", async () => {
    const agent = makeAgent();
    const calls = mockUpdate(agent);
    const { user, onSaved } = renderForm(agent);

    const endpoint = screen.getByPlaceholderText(ENDPOINT_PLACEHOLDER);
    await user.clear(endpoint);
    await user.type(endpoint, "https://other.example.com/a2a");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls[0].body).toEqual({ endpoint_url: "https://other.example.com/a2a" });
    expect(calls[0].body).not.toHaveProperty("capabilities");
    expect(calls[0].body).not.toHaveProperty("skills");
  });

  it("asks for a name and a valid endpoint before sending anything", async () => {
    const calls = mockUpdate(makeAgent());
    const { user, onSaved } = renderForm(makeAgent());

    await user.clear(screen.getByPlaceholderText(NAME_PLACEHOLDER));
    const endpoint = screen.getByPlaceholderText(ENDPOINT_PLACEHOLDER);
    await user.clear(endpoint);
    await user.type(endpoint, "not a url");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Enter a name for the agent.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid http or https endpoint URL.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows a name conflict from the gateway on the name field and stays open", async () => {
    const agent = makeAgent();
    mockUpdate(agent, () =>
      HttpResponse.json(
        { detail: "Public A2A Agent already exists with name: beta" },
        { status: 409 },
      ),
    );
    const { user, onSaved } = renderForm(agent);

    const name = screen.getByPlaceholderText(NAME_PLACEHOLDER);
    await user.clear(name);
    await user.type(name, "Beta");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Public A2A Agent already exists with name: beta"),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue("Beta");
  });

  it("reports any other failure above the buttons", async () => {
    const agent = makeAgent();
    mockUpdate(agent, () => HttpResponse.json({}, { status: 500 }));
    const { user } = renderForm(agent);

    const endpoint = screen.getByPlaceholderText(ENDPOINT_PLACEHOLDER);
    await user.clear(endpoint);
    await user.type(endpoint, "https://other.example.com/a2a");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The agent could not be saved.");
  });

  it("calls Cancel without saving", async () => {
    const calls = mockUpdate(makeAgent());
    const { user, onCancel } = renderForm(makeAgent());

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  describe("credentials", () => {
    it("never shows a stored credential, and keeps it by default", async () => {
      // The gateway masks these on read; whatever it returns must not reach the page.
      const agent = makeAgent({
        authType: "bearer",
        authToken: "*****", // pragma: allowlist secret
      });
      const calls = mockUpdate(agent);
      const { user, onSaved } = renderForm(agent);

      expect(
        screen.getByText("Uses Bearer token. The stored credential is not shown."),
      ).toBeInTheDocument();
      expect(screen.queryByDisplayValue("*****")).not.toBeInTheDocument();

      const name = screen.getByPlaceholderText(NAME_PLACEHOLDER);
      await user.clear(name);
      await user.type(name, "Beta");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(Object.keys(calls[0].body)).toEqual(["name"]);
    });

    it("titles the section Authentication type, once, whether or not credentials are being changed", async () => {
      const { user } = renderForm(makeAgent({ authType: "bearer" }));

      expect(screen.getAllByText("Authentication type")).toHaveLength(1);
      expect(screen.queryByText("Authentication")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Change credentials" }));

      expect(screen.getAllByText("Authentication type")).toHaveLength(1);
      expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    });

    it("says no credential is stored for an agent without one", () => {
      renderForm(makeAgent({ authType: null }));
      expect(screen.getByText("No credential is stored.")).toBeInTheDocument();
    });

    it("replaces the credential with a new one, sent with its auth type", async () => {
      const agent = makeAgent({ authType: "bearer" });
      const calls = mockUpdate(agent);
      const { user, onSaved } = renderForm(agent);

      await user.click(screen.getByRole("button", { name: "Change credentials" }));
      await user.click(screen.getByRole("radio", { name: "Bearer token" }));
      await user.type(screen.getByPlaceholderText("Paste bearer token..."), "new-token");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(calls[0].body).toEqual({ auth_type: "bearer", auth_token: "new-token" });
    });

    it("requires the credential once the user chooses to change it", async () => {
      const agent = makeAgent({ authType: "bearer" });
      const calls = mockUpdate(agent);
      const { user, onSaved } = renderForm(agent);

      await user.click(screen.getByRole("button", { name: "Change credentials" }));
      await user.click(screen.getByRole("radio", { name: "Bearer token" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(
        await screen.findByText("Enter the credentials the agent requires."),
      ).toBeInTheDocument();
      expect(calls).toHaveLength(0);
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("clears the stored credential when None is chosen", async () => {
      const agent = makeAgent({ authType: "bearer" });
      const calls = mockUpdate(agent);
      const { user, onSaved } = renderForm(agent);

      await user.click(screen.getByRole("button", { name: "Change credentials" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(calls[0].body).toEqual({ auth_type: "none" });
    });

    it("goes back to keeping the credential, dropping what was typed", async () => {
      const agent = makeAgent({ authType: "bearer" });
      const calls = mockUpdate(agent);
      const { user, onSaved } = renderForm(agent);

      await user.click(screen.getByRole("button", { name: "Change credentials" }));
      await user.click(screen.getByRole("radio", { name: "Bearer token" }));
      await user.type(screen.getByPlaceholderText("Paste bearer token..."), "typed");
      await user.click(screen.getByRole("button", { name: "Keep the stored credential" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
      expect(calls).toHaveLength(0);
    });

    it("does not offer OAuth as a replacement", async () => {
      const { user } = renderForm(makeAgent({ authType: "bearer" }));

      await user.click(screen.getByRole("button", { name: "Change credentials" }));

      expect(screen.queryByRole("radio", { name: "OAuth 2.0" })).not.toBeInTheDocument();
    });
  });
});
