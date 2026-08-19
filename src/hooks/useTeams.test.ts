import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import * as AuthContextModule from "@/auth/AuthContext";
import type { Team } from "@/types/team";
import { resolveTeamId, useTeams, useTeamScope, type UseTeamScopeOptions } from "./useTeams";

vi.mock("@/api/client", () => ({
  api: { get: vi.fn() },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuthContext: vi.fn(),
}));

const mockGet = vi.mocked(api.get);
const mockUseAuthContext = vi.mocked(AuthContextModule.useAuthContext);

const makeAuthContext = (selectedTeamId: string | null) =>
  ({ selectedTeamId }) as ReturnType<typeof AuthContextModule.useAuthContext>;

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

describe("useTeamScope", () => {
  const baseOptions: UseTeamScopeOptions = {
    visibility: "team",
    teamId: "",
    onTeamIdChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ teams: [personalTeam, sharedTeam] });
    mockUseAuthContext.mockReturnValue(makeAuthContext(null));
  });

  const setup = (options: Partial<UseTeamScopeOptions> = {}) =>
    renderHook(
      (props: Partial<UseTeamScopeOptions>) => useTeamScope({ ...baseOptions, ...props }),
      {
        initialProps: options,
      },
    );

  it("resolves the sidebar's active team while creating", async () => {
    mockUseAuthContext.mockReturnValue(makeAuthContext(sharedTeam.id));
    const onTeamIdChange = vi.fn();
    setup({ onTeamIdChange });

    await waitFor(() => {
      expect(onTeamIdChange).toHaveBeenCalledWith(sharedTeam.id);
    });
  });

  it("falls back to the personal team on All teams", async () => {
    const onTeamIdChange = vi.fn();
    setup({ onTeamIdChange });

    await waitFor(() => {
      expect(onTeamIdChange).toHaveBeenCalledWith(personalTeam.id);
    });
  });

  it("pins to the record's own team while editing, over the sidebar", async () => {
    mockUseAuthContext.mockReturnValue(makeAuthContext(personalTeam.id));
    const onTeamIdChange = vi.fn();
    const { result } = setup({
      teamId: sharedTeam.id,
      recordTeamId: sharedTeam.id,
      onTeamIdChange,
    });

    await waitFor(() => {
      expect(result.current.teams).toHaveLength(2);
    });
    expect(onTeamIdChange).not.toHaveBeenCalled();
  });

  it("restores the record's team once it loads after the fallback resolved", async () => {
    const onTeamIdChange = vi.fn();
    const { rerender } = setup({ onTeamIdChange });

    await waitFor(() => {
      expect(onTeamIdChange).toHaveBeenCalledWith(personalTeam.id);
    });
    onTeamIdChange.mockClear();

    // The record's own team arrives after its request lands.
    rerender({ teamId: personalTeam.id, recordTeamId: sharedTeam.id, onTeamIdChange });

    await waitFor(() => {
      expect(onTeamIdChange).toHaveBeenCalledWith(sharedTeam.id);
    });
  });

  it("keeps an in-form pick over a later sidebar switch", async () => {
    const onTeamIdChange = vi.fn();
    const { result, rerender } = setup({ teamId: personalTeam.id, onTeamIdChange });

    await waitFor(() => {
      expect(result.current.teams).toHaveLength(2);
    });
    act(() => result.current.onTeamChange(sharedTeam.id));
    expect(onTeamIdChange).toHaveBeenCalledWith(sharedTeam.id);
    onTeamIdChange.mockClear();

    mockUseAuthContext.mockReturnValue(makeAuthContext(personalTeam.id));
    rerender({ teamId: sharedTeam.id, onTeamIdChange });

    expect(onTeamIdChange).not.toHaveBeenCalled();
  });

  it("resolves afresh when visibility leaves team and comes back after a pick", async () => {
    const onTeamIdChange = vi.fn();
    const { result, rerender } = setup({ teamId: personalTeam.id, onTeamIdChange });

    await waitFor(() => {
      expect(result.current.teams).toHaveLength(2);
    });
    act(() => result.current.onTeamChange(sharedTeam.id));
    onTeamIdChange.mockClear();

    rerender({ visibility: "public", teamId: sharedTeam.id, onTeamIdChange });
    await waitFor(() => {
      expect(onTeamIdChange).toHaveBeenCalledWith("");
    });
    onTeamIdChange.mockClear();

    // Without clearing the pick latch, teamId would stay empty for good — and a
    // single-team caller has no selector to recover with.
    rerender({ visibility: "team", teamId: "", onTeamIdChange });

    await waitFor(() => {
      expect(onTeamIdChange).toHaveBeenCalledWith(personalTeam.id);
    });
  });

  it("drops the team when visibility leaves team", async () => {
    const onTeamIdChange = vi.fn();
    const { rerender } = setup({ teamId: sharedTeam.id, onTeamIdChange });

    rerender({ visibility: "public", teamId: sharedTeam.id, onTeamIdChange });

    await waitFor(() => {
      expect(onTeamIdChange).toHaveBeenCalledWith("");
    });
  });
});
