import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
      screen.getByText("Agents will appear here once they're registered with the gateway."),
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
});
