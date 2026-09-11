/** Transport for the invitations addressed to the current user. */
import { api } from "@/api/client";
import type { TeamInvitation, TeamMember } from "@/types/team";

/** Invitations addressed to the caller, resolved from the authenticated identity. */
export function listMyInvitations(): Promise<TeamInvitation[]> {
  return api.get<TeamInvitation[]>("/users/me/invitations");
}

export function acceptInvitation(token: string): Promise<TeamMember> {
  return api.post<TeamMember>(`/teams/invitations/${encodeURIComponent(token)}/accept`);
}

export function declineInvitation(token: string): Promise<void> {
  return api.post<void>(`/teams/invitations/${encodeURIComponent(token)}/decline`);
}
