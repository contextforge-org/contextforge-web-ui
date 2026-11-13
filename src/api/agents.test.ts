import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { agentsApi } from "./agents";
import { setCsrfToken } from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("agentsApi", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.clearAllMocks();
    setCsrfToken("test-csrf-token");
  });

  afterEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("fetchCard", () => {
    it("POSTs the URL as baseUrl to /v1/a2a/fetch-card and returns the result", async () => {
      const result = { found: false, outcome: "no_card" };
      mockFetch.mockResolvedValueOnce(json(result));

      await expect(agentsApi.fetchCard("https://agent.example.com")).resolves.toEqual(result);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/a2a/fetch-card"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ baseUrl: "https://agent.example.com" }),
        }),
      );
    });
  });

  describe("create", () => {
    it("POSTs the embedded body (agent, visibility, team_id) to /v1/a2a", async () => {
      const body = {
        agent: { name: "Alpha", endpoint_url: "https://agent.example.com/rpc" },
        visibility: "team",
        team_id: "team-1",
      };
      mockFetch.mockResolvedValueOnce(json({ id: "a1", name: "Alpha" }, 201));

      await agentsApi.create(body);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/a2a$/),
        expect.objectContaining({ method: "POST", body: JSON.stringify(body) }),
      );
    });
  });

  describe("setState / delete", () => {
    it("POSTs /v1/a2a/:id/state with the activate flag", async () => {
      mockFetch.mockResolvedValueOnce(json({ id: "a1", enabled: false }));

      await agentsApi.setState("a1", false);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/a2a/a1/state?activate=false"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("DELETEs /v1/a2a/:id", async () => {
      mockFetch.mockResolvedValueOnce(json({ status: "success" }));

      await agentsApi.delete("a1");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/a2a\/a1$/),
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it.each([
      ["", "Invalid agent ID"],
      ["../etc", "Invalid agent ID format"],
      ["a/b", "Invalid agent ID format"],
    ])("rejects the unsafe id %j before any request", (id, message) => {
      expect(() => agentsApi.delete(id)).toThrow(message);
      expect(() => agentsApi.setState(id, true)).toThrow(message);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
