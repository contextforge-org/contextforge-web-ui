import { api } from "@/api/client";
import type {
  TeamCreateResponse,
  TeamInvitationCreateResponse,
  TeamInviteRequest,
  TeamMemberSeed,
} from "@/generated/types";
import type { Team, TeamMember, AddTeamMemberRequest, UpdateTeamMemberRequest } from "@/types/team";

interface CreateTeamPayload {
  name: string;
  description?: string;
  visibility: "private" | "public";
  max_members?: number;
  // Routed server-side in one transaction: an address that belongs to an
  // active user is added directly, anything else gets an invitation.
  members?: TeamMemberSeed[];
}

interface UpdateTeamPayload {
  name?: string;
  description?: string;
  visibility?: "private" | "public";
  max_members?: number;
}

export function createTeam(payload: CreateTeamPayload): Promise<TeamCreateResponse> {
  return api.post<TeamCreateResponse>("/teams", payload);
}

export function updateTeam(id: string, payload: UpdateTeamPayload): Promise<Team> {
  return api.put<Team>(`/teams/${encodeURIComponent(id)}`, payload);
}

export function deleteTeam(id: string): Promise<void> {
  return api.delete<void>(`/teams/${encodeURIComponent(id)}`);
}

export function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  // Default (no include_pagination) returns every team member as a bare array,
  // with no cursor metadata.
  return api.get<TeamMember[]>(`/teams/${encodeURIComponent(teamId)}/members`);
}

export function addTeamMember(teamId: string, data: AddTeamMemberRequest): Promise<void> {
  return api.post<void>(`/teams/${encodeURIComponent(teamId)}/members`, data);
}

/**
 * Invites an address to an existing team. Unlike {@link addTeamMember}, this
 * does not require the address to already have an account — the invitee
 * receives an email (when SMTP is configured) and gets membership on accept.
 */
export function inviteTeamMember(
  teamId: string,
  data: TeamInviteRequest,
): Promise<TeamInvitationCreateResponse> {
  return api.post<TeamInvitationCreateResponse>(
    `/teams/${encodeURIComponent(teamId)}/invitations`,
    data,
  );
}

export function updateTeamMember(
  teamId: string,
  userEmail: string,
  data: UpdateTeamMemberRequest,
): Promise<void> {
  return api.put<void>(
    `/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userEmail)}`,
    data,
  );
}

export function removeTeamMember(teamId: string, userEmail: string): Promise<void> {
  return api.delete<void>(
    `/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userEmail)}`,
  );
}
