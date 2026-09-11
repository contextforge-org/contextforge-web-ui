/**
 * Transport for the invitee's own team invitations.
 *
 * Two of the three routes do not exist yet; they are the subject of #6010,
 * which also leaves the inbox path undecided between `/users/me/invitations`
 * and `/teams/invitations/mine`. Confining both to this module keeps settling
 * that to a one-line change here.
 */
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
