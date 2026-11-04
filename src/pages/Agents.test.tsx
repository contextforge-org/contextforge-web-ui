import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockHasPermission = vi.fn((_perm: string) => true);

vi.mock("@/auth/AuthContext", () => ({
  useAuthContext: () => ({
    user: { email: "test@example.com", is_admin: true, is_active: true },
    isAuthenticated: true,
    isLoading: false,
    selectedTeamId: null,
    login: vi.fn(),
    logout: vi.fn(),
    setSelectedTeamId: vi.fn(),
    hasPermission: mockHasPermission,
    permissionsLoading: false,
  }),
}));

import { toast } from "sonner";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { Agents } from "./Agents";
import { renderWithProviders } from "@/test/test-utils";
import type { A2AAgentRead } from "@/generated/types";

type Agent = NonNullable<A2AAgentRead>;

function createMockAgent(id: number, overrides: Partial<Agent> = {}): Agent {
  return {
    id: `agent-${id}`,
    name: `Agent ${id}`,
    slug: `agent-${id}`,
    description: `Description for agent ${id}`,
    endpointUrl: `http://localhost/agents/${id}`,
    agentType: "generic",
    protocolVersion: "1.0",
    capabilities: {},
    config: {},
    enabled: true,
    reachable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastInteraction: null,
    tags: [],
    ...overrides,
  };
}

describe("Agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPermission.mockImplementation((perm) => perm !== "a2a.create");
  });

  it("renders loading state initially", async () => {
    let resolveRequest: () => void;
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve;
    });

    server.use(
      http.get("/api/a2a", async () => {
        await requestGate;
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<Agents />);

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading agents, please wait...")).toBeInTheDocument();

    resolveRequest!();
    await waitFor(() => {
      expect(screen.getByText("No agents yet")).toBeInTheDocument();
    });
  });

  it("displays error message when the API call fails", async () => {
    server.use(
      http.get("/api/a2a", () =>
        HttpResponse.json({ detail: "Failed to fetch agents" }, { status: 500 }),
      ),
    );

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("Error loading agents")).toBeInTheDocument();
  });

  it("shows an empty state when there are no agents", async () => {
    server.use(http.get("/api/a2a", () => HttpResponse.json([])));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("No agents yet")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Agents will appear here once they're registered with the server."),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(0);
  });

  it("renders a card per agent with its name and description", async () => {
    const mockAgents = [createMockAgent(1), createMockAgent(2)];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("Agent 1")).toBeInTheDocument();
    });
    expect(screen.getByText("Agent 2")).toBeInTheDocument();
    expect(screen.getByText("Description for agent 1")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(2);
  });

  it("omits the description when an agent has none", async () => {
    const mockAgents = [createMockAgent(1, { description: "" })];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("Agent 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Description for agent 1")).not.toBeInTheDocument();
  });

  it("shows an active status indicator when the agent is enabled and reachable", async () => {
    const mockAgents = [createMockAgent(1, { enabled: true, reachable: true })];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    expect(await screen.findByRole("img", { name: "Active" })).toBeInTheDocument();
  });

  it("shows an inactive status indicator when the agent is disabled or unreachable", async () => {
    const mockAgents = [createMockAgent(1, { enabled: false, reachable: true })];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    expect(await screen.findByRole("img", { name: "Inactive" })).toBeInTheDocument();
  });

  it("renders tag chips for an agent's tags", async () => {
    const mockAgents = [
      createMockAgent(1, { tags: [{ label: "billing" }, { label: "internal" }] }),
    ];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("billing")).toBeInTheDocument();
    });
    expect(screen.getByText("internal")).toBeInTheDocument();
  });

  it("caps visible tags at 8 and shows a +N overflow chip", async () => {
    const mockAgents = [
      createMockAgent(1, {
        tags: Array.from({ length: 10 }, (_, i) => ({ label: `tag-${i + 1}` })),
      }),
    ];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("tag-1")).toBeInTheDocument();
    });
    expect(screen.getByText("tag-8")).toBeInTheDocument();
    expect(screen.queryByText("tag-9")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders without tags when the field is omitted entirely", async () => {
    const agent = createMockAgent(1);
    delete (agent as Partial<Agent>).tags;
    server.use(http.get("/api/a2a", () => HttpResponse.json([agent])));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("Agent 1")).toBeInTheDocument();
    });
  });

  it("ignores null entries returned by the API", async () => {
    const mockAgents: (Agent | null)[] = [createMockAgent(1), null];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("Agent 1")).toBeInTheDocument();
    });
    expect(document.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it("treats a non-array response as an empty list instead of crashing", async () => {
    // The shape a broken/legacy backend response would take — guards the
    // Array.isArray fallback rather than assuming `data` is always an array.
    server.use(http.get("/api/a2a", () => HttpResponse.json({ agents: [] })));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("No agents yet")).toBeInTheDocument();
    });
  });

  it("requests the list with include_inactive=true so disabled agents stay listed", async () => {
    let requestedUrl: URL | undefined;
    server.use(
      http.get("/api/a2a", ({ request }) => {
        requestedUrl = new URL(request.url);
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("No agents yet")).toBeInTheDocument();
    });
    expect(requestedUrl?.searchParams.get("include_inactive")).toBe("true");
    expect(requestedUrl?.searchParams.get("limit")).toBe("0");
  });

  it("uses correct grid layout classes", async () => {
    const mockAgents = [createMockAgent(1)];
    server.use(http.get("/api/a2a", () => HttpResponse.json(mockAgents)));

    renderWithProviders(<Agents />);

    await waitFor(() => {
      expect(screen.getByText("Agent 1")).toBeInTheDocument();
    });

    const gridContainer = screen.getByText("Agent 1").closest('[data-slot="card"]')?.parentElement;
    expect(gridContainer).toBeInTheDocument();
    expect(gridContainer).toHaveClass("grid");
    expect(gridContainer).toHaveClass("grid-cols-1");
    expect(gridContainer).toHaveClass("lg:grid-cols-2");
    expect(gridContainer).toHaveClass("2xl:grid-cols-3");
  });
  describe("connect agent card", () => {
    it("shows only the Connect agent card when nothing is connected and the user can create", async () => {
      mockHasPermission.mockImplementation(() => true);
      server.use(http.get("/api/a2a", () => HttpResponse.json([])));

      renderWithProviders(<Agents />);

      expect(await screen.findByText("Connect agent")).toBeInTheDocument();
      expect(screen.getByText("Connect an agent over the A2A protocol")).toBeInTheDocument();
      expect(screen.queryByText("No agents yet")).not.toBeInTheDocument();
    });

    it("lists the Connect agent card ahead of existing agents", async () => {
      mockHasPermission.mockImplementation(() => true);
      server.use(http.get("/api/a2a", () => HttpResponse.json([createMockAgent(1)])));

      renderWithProviders(<Agents />);

      const connect = await screen.findByText("Connect agent");
      const agent = screen.getByText("Agent 1");
      expect(
        connect.compareDocumentPosition(agent) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("hides the Connect agent card without a2a.create", async () => {
      server.use(http.get("/api/a2a", () => HttpResponse.json([createMockAgent(1)])));

      renderWithProviders(<Agents />);

      await screen.findByText("Agent 1");
      expect(screen.queryByText("Connect agent")).not.toBeInTheDocument();
    });
  });

  describe("actions", () => {
    async function openMenu(name: string) {
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
      return user;
    }

    it("disables an enabled agent and reflects the new state", async () => {
      const agent = createMockAgent(1, { enabled: true });
      let requestedUrl = "";
      server.use(
        http.get("/api/a2a", () => HttpResponse.json([agent])),
        http.post("/api/a2a/:id/state", ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({ ...agent, enabled: false });
        }),
      );

      renderWithProviders(<Agents />);
      const user = await openMenu("Agent 1");
      await user.click(await screen.findByRole("menuitem", { name: "Disable" }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Disabled Agent 1"));
      expect(new URL(requestedUrl).searchParams.get("activate")).toBe("false");
      expect(screen.getByRole("img", { name: "Inactive" })).toBeInTheDocument();
    });

    it("reverts the optimistic toggle and reports an error when the request fails", async () => {
      const agent = createMockAgent(1, { enabled: true });
      server.use(
        http.get("/api/a2a", () => HttpResponse.json([agent])),
        http.post("/api/a2a/:id/state", () =>
          HttpResponse.json({ detail: "boom" }, { status: 500 }),
        ),
      );

      renderWithProviders(<Agents />);
      const user = await openMenu("Agent 1");
      await user.click(await screen.findByRole("menuitem", { name: "Disable" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(screen.getByRole("img", { name: "Active" })).toBeInTheDocument();
    });

    it("asks for confirmation before deleting, then removes the agent", async () => {
      const agent = createMockAgent(1);
      let deleted = false;
      server.use(
        http.get("/api/a2a", () => HttpResponse.json(deleted ? [] : [agent])),
        http.delete("/api/a2a/:id", () => {
          deleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      renderWithProviders(<Agents />);
      const user = await openMenu("Agent 1");
      await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

      expect(deleted).toBe(false);
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Deleted Agent 1"));
      expect(screen.queryByText("Agent 1")).not.toBeInTheDocument();
    });

    it("keeps the agent when the delete confirmation is cancelled", async () => {
      server.use(http.get("/api/a2a", () => HttpResponse.json([createMockAgent(1)])));

      renderWithProviders(<Agents />);
      const user = await openMenu("Agent 1");
      await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(screen.getByText("Agent 1")).toBeInTheDocument();
    });

    it("hides each action the user lacks permission for", async () => {
      mockHasPermission.mockImplementation((perm) => perm === "a2a.update");
      server.use(http.get("/api/a2a", () => HttpResponse.json([createMockAgent(1)])));

      renderWithProviders(<Agents />);
      await openMenu("Agent 1");

      expect(await screen.findByRole("menuitem", { name: "Disable" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    });

    it("renders no actions menu without update or delete permission", async () => {
      mockHasPermission.mockImplementation(() => false);
      server.use(http.get("/api/a2a", () => HttpResponse.json([createMockAgent(1)])));

      renderWithProviders(<Agents />);

      await screen.findByText("Agent 1");
      expect(screen.queryByRole("button", { name: /Actions for/ })).not.toBeInTheDocument();
    });
  });
});
