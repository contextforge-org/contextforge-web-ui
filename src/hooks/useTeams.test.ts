import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import type { Team } from "@/types/team";
import { resolveTeamId, useTeams } from "./useTeams";

vi.mock("@/api/client", () => ({
  api: { get: vi.fn() },
}));

const mockGet = vi.mocked(api.get);

const personalTeam = { id: "team-personal", name: "Personal team", is_personal: true } as Team;
const sharedTeam = { id: "team-shared", name: "Shared team", is_personal: false } as Team;

describe("useTeams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes the caller's teams", async () => {
    mockGet.mockResolvedValue({ teams: [personalTeam] });
    const { result } = renderHook(() => useTeams());

    await waitFor(() => {
      expect(result.current.teams).toEqual([personalTeam]);
    });
  });

  it("requires no selection for a single team", async () => {
    mockGet.mockResolvedValue({ teams: [personalTeam] });
    const { result } = renderHook(() => useTeams());

    await waitFor(() => {
      expect(result.current.teams).toHaveLength(1);
    });
    expect(result.current.requiresSelection).toBe(false);
  });

  it("requires a selection beyond one team", async () => {
    mockGet.mockResolvedValue({ teams: [personalTeam, sharedTeam] });
    const { result } = renderHook(() => useTeams());

    await waitFor(() => {
      expect(result.current.requiresSelection).toBe(true);
    });
  });

  it("yields no teams when the request fails", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useTeams());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.teams).toEqual([]);
  });
});

describe("resolveTeamId", () => {
  it("prefers an explicit team over every default", () => {
    expect(resolveTeamId([personalTeam, sharedTeam], personalTeam.id, sharedTeam.id)).toBe(
      sharedTeam.id,
    );
  });

  it("falls back to the sidebar's active team", () => {
    expect(resolveTeamId([personalTeam, sharedTeam], sharedTeam.id)).toBe(sharedTeam.id);
  });

  it("falls back to the personal team", () => {
    expect(resolveTeamId([sharedTeam, personalTeam], null)).toBe(personalTeam.id);
  });

  it("falls back to the first team when none is personal", () => {
    expect(resolveTeamId([sharedTeam], null)).toBe(sharedTeam.id);
  });

  it("resolves nothing without teams", () => {
    expect(resolveTeamId([], null)).toBeUndefined();
  });
});
