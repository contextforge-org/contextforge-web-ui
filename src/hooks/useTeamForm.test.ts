import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook as rtlRenderHook, act, waitFor } from "@testing-library/react";
import { createElement, type FormEvent, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "@/test/mocks/server";
import enMessages from "@/i18n/locales/en-US";
import type { Team } from "@/types/team";
import { useTeamForm } from "./useTeamForm";

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  id: "team-1",
  name: "Engineering",
  slug: "engineering",
  description: "Eng team",
  created_by: "admin@example.com",
  is_personal: false,
  visibility: "public",
  max_members: 50,
  member_count: 3,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_active: true,
  ...overrides,
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockToastWarning = vi.mocked(toast.warning);
const mockToastSuccess = vi.mocked(toast.success);

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    IntlProvider,
    { locale: "en", defaultLocale: "en", messages: enMessages },
    children,
  );

const renderHook = <Result, Props>(render: (initialProps: Props) => Result) =>
  rtlRenderHook(render, { wrapper });

const fakeSubmit = (e?: Partial<FormEvent<HTMLFormElement>>) =>
  ({ preventDefault: vi.fn(), ...e }) as FormEvent<HTMLFormElement>;

beforeEach(() => {
  mockToastWarning.mockClear();
  mockToastSuccess.mockClear();
  // The hook loads the user directory on mount; keep it quiet by default.
  server.use(http.get("*/auth/email/admin/users", () => HttpResponse.json({ users: [] })));
});

describe("useTeamForm", () => {
  describe("Initial State", () => {
    it("initializes with defaults and a single member row", () => {
      const { result } = renderHook(() => useTeamForm());

      expect(result.current.name).toBe("");
      expect(result.current.description).toBe("");
      expect(result.current.visibility).toBe("private");
      expect(result.current.maxMembers).toBe("100");
      expect(result.current.members).toEqual([{ email: "", role: "member" }]);
      expect(result.current.error).toBeNull();
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe("member row actions", () => {
    it("adds, edits, and removes member rows", () => {
      const { result } = renderHook(() => useTeamForm());

      act(() => result.current.handleAddMember());
      expect(result.current.members).toHaveLength(2);

      act(() => {
        result.current.handleMemberEmailChange(1, "user@example.com");
        result.current.handleMemberRoleChange(1, "member");
      });
      expect(result.current.members[1]).toEqual({ email: "user@example.com", role: "member" });

      act(() => result.current.handleRemoveMember(0));
      expect(result.current.members).toEqual([{ email: "user@example.com", role: "member" }]);
    });
  });

  describe("validateForm", () => {
    it("returns false and sets an error when name is empty", () => {
      const { result } = renderHook(() => useTeamForm());

      let valid: boolean;
      act(() => {
        valid = result.current.validateForm();
      });

      expect(valid!).toBe(false);
      expect(result.current.error).toBeTruthy();
    });

    it("returns false when name contains disallowed characters", () => {
      const { result } = renderHook(() => useTeamForm());

      act(() => result.current.setName("bad/name"));

      let valid: boolean;
      act(() => {
        valid = result.current.validateForm();
      });

      expect(valid!).toBe(false);
      expect(result.current.error).toBeTruthy();
    });

    it("returns true for a valid name", () => {
      const { result } = renderHook(() => useTeamForm());

      act(() => result.current.setName("Engineering Team"));

      let valid: boolean;
      act(() => {
        valid = result.current.validateForm();
      });

      expect(valid!).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe("handleSubmit", () => {
    it("does not call the API when the form is invalid", async () => {
      const postSpy = vi.fn(() => HttpResponse.json({}, { status: 201 }));
      server.use(http.post("*/teams", postSpy));

      const { result } = renderHook(() => useTeamForm());

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit());
      });

      expect(postSpy).not.toHaveBeenCalled();
    });

    it("creates a team and calls onSuccess", async () => {
      let capturedBody: unknown;
      server.use(
        http.post("*/teams", async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ id: "team-1", name: "Engineering" }, { status: 201 });
        }),
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm());

      act(() => result.current.setName("Engineering"));

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(capturedBody).toMatchObject({ name: "Engineering", visibility: "private" });
      // Form resets after a successful create.
      expect(result.current.name).toBe("");
    });

    it("sends filled members in the create-team payload instead of looping add-member calls", async () => {
      let capturedBody: Record<string, unknown> = {};
      const memberCalls: unknown[] = [];
      server.use(
        http.post("*/teams", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: "team-1", name: "Engineering" }, { status: 201 });
        }),
        // Seeding happens inside the create-team request now; nothing should
        // call the per-member add endpoint.
        http.post("*/teams/team-1/members", async ({ request }) => {
          memberCalls.push(await request.json());
          return HttpResponse.json({}, { status: 201 });
        }),
      );

      const { result } = renderHook(() => useTeamForm());

      act(() => {
        result.current.setName("Engineering");
        result.current.handleMemberEmailChange(0, "member@example.com");
      });

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit());
      });

      await waitFor(() => expect(capturedBody).toHaveProperty("members"));
      expect(capturedBody.members).toEqual([{ email: "member@example.com", role: "member" }]);
      expect(memberCalls).toHaveLength(0);
    });

    it("omits members from the payload when every row is empty", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.post("*/teams", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: "team-1", name: "Engineering" }, { status: 201 });
        }),
      );

      const { result } = renderHook(() => useTeamForm());

      act(() => result.current.setName("Engineering"));

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit());
      });

      await waitFor(() => expect(capturedBody).toHaveProperty("name"));
      expect(capturedBody).not.toHaveProperty("members");
    });

    it("reports invited addresses via toast without blocking on an inline error", async () => {
      server.use(
        http.post("*/teams", () =>
          HttpResponse.json(
            {
              id: "team-1",
              name: "Engineering",
              members_added: [],
              invitations_sent: [
                { email: "external@partner.com", role: "member", invitation_id: "inv-1" },
              ],
            },
            { status: 201 },
          ),
        ),
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm());

      act(() => {
        result.current.setName("Engineering");
        result.current.handleMemberEmailChange(0, "external@partner.com");
      });

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("invitation"),
        expect.objectContaining({ description: expect.stringContaining("external@partner.com") }),
      );
      expect(result.current.error).toBeNull();
      // Form resets after a successful create.
      expect(result.current.name).toBe("");
    });

    it("reports both directly added and invited addresses for a mixed submission", async () => {
      server.use(
        http.post("*/teams", () =>
          HttpResponse.json(
            {
              id: "team-1",
              name: "Engineering",
              members_added: [{ email: "existing@partner.com", role: "member" }],
              invitations_sent: [
                { email: "external@partner.com", role: "member", invitation_id: "inv-1" },
              ],
            },
            { status: 201 },
          ),
        ),
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm());

      act(() => {
        result.current.setName("Engineering");
        result.current.handleMemberEmailChange(0, "existing@partner.com");
      });

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("member"),
        expect.objectContaining({ description: expect.stringContaining("existing@partner.com") }),
      );
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("invitation"),
        expect.objectContaining({ description: expect.stringContaining("external@partner.com") }),
      );
    });

    it("creation fails as a unit when a seeded member row is invalid, with no partial-success toast", async () => {
      server.use(
        http.post("*/teams", () =>
          HttpResponse.json({ detail: "Team member seed limit exceeded" }, { status: 400 }),
        ),
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm());

      act(() => {
        result.current.setName("Engineering");
        result.current.handleMemberEmailChange(0, "owner@example.com");
      });

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mockToastWarning).not.toHaveBeenCalled();
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it("rejects an invalid member email before creating the team", async () => {
      const postSpy = vi.fn(() => HttpResponse.json({}, { status: 201 }));
      server.use(http.post("*/teams", postSpy));

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm());

      act(() => {
        result.current.setName("Engineering");
        result.current.handleMemberEmailChange(0, "not-an-email");
      });

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      expect(postSpy).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(result.current.error).toBeTruthy();
    });

    it("sets an error when team creation fails", async () => {
      server.use(
        http.post("*/teams", () =>
          HttpResponse.json({ detail: "Team already exists" }, { status: 409 }),
        ),
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm());

      act(() => result.current.setName("Engineering"));

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe("edit mode", () => {
    it("pre-populates state from the team and flags edit mode", () => {
      const team = makeTeam();
      const { result } = renderHook(() => useTeamForm(team));

      expect(result.current.isEditMode).toBe(true);
      expect(result.current.name).toBe("Engineering");
      expect(result.current.description).toBe("Eng team");
      expect(result.current.visibility).toBe("public");
      expect(result.current.maxMembers).toBe("50");
    });

    it("PUTs to the team endpoint and calls onSuccess without touching members", async () => {
      let capturedBody: unknown;
      const memberCalls: unknown[] = [];
      server.use(
        http.put("*/teams/team-1", async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ id: "team-1", name: "Renamed" });
        }),
        http.post("*/teams/team-1/members", async ({ request }) => {
          memberCalls.push(await request.json());
          return HttpResponse.json({}, { status: 201 });
        }),
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm(makeTeam()));

      act(() => {
        result.current.setName("Renamed");
        result.current.setVisibility("private");
      });

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
      expect(capturedBody).toMatchObject({ name: "Renamed", visibility: "private" });
      // max_members was not touched, so it is omitted to preserve the team's value.
      expect(capturedBody).not.toHaveProperty("max_members");
      expect(memberCalls).toHaveLength(0);
      // Edit mode leaves the entered values in place (no reset to create defaults).
      expect(result.current.name).toBe("Renamed");
    });

    it("exposes an off-list max_members value as a selectable option", () => {
      const { result } = renderHook(() => useTeamForm(makeTeam({ max_members: 75 })));

      expect(result.current.maxMembers).toBe("75");
      // The custom value is merged into the presets in ascending order.
      expect(result.current.maxMembersOptions).toEqual([
        "10",
        "25",
        "50",
        "75",
        "100",
        "250",
        "500",
      ]);
    });

    it("keeps only the presets when max_members matches one", () => {
      const { result } = renderHook(() => useTeamForm(makeTeam({ max_members: 100 })));

      expect(result.current.maxMembersOptions).toEqual(["10", "25", "50", "100", "250", "500"]);
    });

    it("sends max_members only when the user changes it", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.put("*/teams/team-1", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: "team-1", name: "Engineering" });
        }),
      );

      const { result } = renderHook(() => useTeamForm(makeTeam({ max_members: 50 })));

      act(() => result.current.setMaxMembers("250"));

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit());
      });

      await waitFor(() => expect(capturedBody).toHaveProperty("max_members"));
      expect(capturedBody.max_members).toBe(250);
    });

    it("omits max_members for a team with no override so it stays unset", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.put("*/teams/team-1", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: "team-1", name: "Engineering" });
        }),
      );

      // max_members undefined => the form shows the default ("100") but must not
      // pin the team to it on save.
      const { result } = renderHook(() => useTeamForm(makeTeam({ max_members: undefined })));

      act(() => result.current.setName("Engineering Renamed"));

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit());
      });

      await waitFor(() => expect(capturedBody).toHaveProperty("name"));
      expect(capturedBody).not.toHaveProperty("max_members");
    });

    it("sends an empty description so clearing it is persisted, not ignored", async () => {
      let capturedBody: Record<string, unknown> = {};
      server.use(
        http.put("*/teams/team-1", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ id: "team-1", name: "Engineering" });
        }),
      );

      const { result } = renderHook(() => useTeamForm(makeTeam({ description: "Eng team" })));

      act(() => result.current.setDescription(""));

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit());
      });

      await waitFor(() => expect(capturedBody).toHaveProperty("description"));
      // An empty string (not undefined) reaches the backend, which only
      // overwrites the stored description when the field is present.
      expect(capturedBody.description).toBe("");
    });

    it("sets an error and skips onSuccess when the update fails", async () => {
      server.use(
        http.put("*/teams/team-1", () =>
          HttpResponse.json({ detail: "Update failed" }, { status: 403 }),
        ),
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useTeamForm(makeTeam()));

      await act(async () => {
        await result.current.handleSubmit(fakeSubmit(), onSuccess);
      });

      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });
});
