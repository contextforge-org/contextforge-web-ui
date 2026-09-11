import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { I18nProvider } from "@/i18n";
import type { TeamInvitation } from "@/types/team";
import { usePendingInvitationsData } from "./usePendingInvitationsData";

vi.mock("@/api/invitations", () => ({
  listMyInvitations: vi.fn(),
  acceptInvitation: vi.fn(() => Promise.resolve()),
  declineInvitation: vi.fn(() => Promise.resolve()),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { listMyInvitations, acceptInvitation, declineInvitation } from "@/api/invitations";
import { toast } from "sonner";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, null, children);
}

function makeInvitation(overrides: Partial<TeamInvitation> = {}): TeamInvitation {
  return {
    id: "inv-1",
    team_id: "team-1",
    team_name: "Platform Team",
    email: "invitee@example.com",
    role: "member",
    invited_by: "janet@example.com",
    invited_at: "2026-09-10T10:00:00Z",
    expires_at: "2026-09-17T10:00:00Z",
    token: "tok-1",
    is_active: true,
    is_expired: false,
    ...overrides,
  };
}

const one = makeInvitation();
const two = makeInvitation({ id: "inv-2", team_name: "Design Team", token: "tok-2" });

function renderInvitations(enabled = true) {
  return renderHook(() => usePendingInvitationsData({ enabled }), { wrapper });
}

describe("usePendingInvitationsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMyInvitations).mockResolvedValue([one, two]);
    vi.mocked(acceptInvitation).mockResolvedValue({
      user_email: "invitee@example.com",
      role: "member",
      joined_at: "2026-09-11T10:00:00Z",
    });
    vi.mocked(declineInvitation).mockResolvedValue(undefined);
  });

  it("fetches on mount and counts every invitation as pending", async () => {
    const { result } = renderInvitations();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(listMyInvitations).toHaveBeenCalledTimes(1);
    expect(result.current.invitations).toEqual([one, two]);
    expect(result.current.pendingCount).toBe(2);
    expect(result.current.acceptedCount).toBe(0);
  });

  it("makes no request while disabled", async () => {
    const { result } = renderInvitations(false);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(listMyInvitations).not.toHaveBeenCalled();
  });

  it("surfaces a load failure without a toast", async () => {
    vi.mocked(listMyInvitations).mockRejectedValue(
      Object.assign(new Error("nope"), { status: 500, body: {} }),
    );
    const { result } = renderInvitations();

    await waitFor(() => expect(result.current.error).toBe("Server error. Please try again later."));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("commits an accepted resolution and bumps acceptedCount", async () => {
    const { result } = renderInvitations();
    await waitFor(() => expect(result.current.invitations).toHaveLength(2));

    await act(async () => {
      await result.current.accept(one);
    });

    expect(acceptInvitation).toHaveBeenCalledWith("tok-1");
    expect(result.current.resolutions).toEqual({ "inv-1": "accepted" });
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.acceptedCount).toBe(1);
    expect(result.current.inFlight).toEqual({});
  });

  it("reports the action in flight while the request is open", async () => {
    let release: () => void = () => {};
    vi.mocked(acceptInvitation).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(undefined as never);
      }),
    );
    const { result } = renderInvitations();
    await waitFor(() => expect(result.current.invitations).toHaveLength(2));

    let pending: Promise<void>;
    act(() => {
      pending = result.current.accept(one);
    });

    await waitFor(() => expect(result.current.inFlight).toEqual({ "inv-1": "accept" }));
    expect(result.current.resolutions).toEqual({});

    await act(async () => {
      release();
      await pending;
    });

    expect(result.current.inFlight).toEqual({});
  });

  it("leaves a failed accept actionable and toasts the reason", async () => {
    vi.mocked(acceptInvitation).mockRejectedValue(
      Object.assign(new Error("nope"), { status: 403, body: {} }),
    );
    const { result } = renderInvitations();
    await waitFor(() => expect(result.current.invitations).toHaveLength(2));

    await act(async () => {
      await result.current.accept(one);
    });

    expect(result.current.resolutions).toEqual({});
    expect(result.current.pendingCount).toBe(2);
    expect(result.current.acceptedCount).toBe(0);
    expect(toast.error).toHaveBeenCalledWith("Failed to join team", {
      description: "You don't have permission to perform this action.",
    });
  });

  it("commits a declined resolution without bumping acceptedCount", async () => {
    const { result } = renderInvitations();
    await waitFor(() => expect(result.current.invitations).toHaveLength(2));

    await act(async () => {
      await result.current.decline(two);
    });

    expect(declineInvitation).toHaveBeenCalledWith("tok-2");
    expect(result.current.resolutions).toEqual({ "inv-2": "declined" });
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.acceptedCount).toBe(0);
  });

  it("leaves a failed decline actionable and toasts the reason", async () => {
    vi.mocked(declineInvitation).mockRejectedValue(new Error("boom"));
    const { result } = renderInvitations();
    await waitFor(() => expect(result.current.invitations).toHaveLength(2));

    await act(async () => {
      await result.current.decline(two);
    });

    expect(result.current.resolutions).toEqual({});
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to decline invitation",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("drops resolutions for invitations the server no longer returns", async () => {
    const { result } = renderInvitations();
    await waitFor(() => expect(result.current.invitations).toHaveLength(2));

    await act(async () => {
      await result.current.accept(one);
    });
    expect(result.current.resolutions).toEqual({ "inv-1": "accepted" });

    vi.mocked(listMyInvitations).mockResolvedValue([two]);
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.invitations).toEqual([two]);
    expect(result.current.resolutions).toEqual({});
    expect(result.current.pendingCount).toBe(1);
    // The accepted total is a session tally, not a property of the list.
    expect(result.current.acceptedCount).toBe(1);
  });
});
