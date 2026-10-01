/** Re-exported, not restated, so backend drift surfaces as a compile error. */
export type { TeamInvitationResponse as TeamInvitation } from "@/generated/types";

export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  created_by: string;
  is_personal: boolean;
  visibility: "private" | "public";
  max_members?: number;
  member_count: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface TeamsResponse {
  teams: Team[];
  nextCursor?: string;
}

export interface TeamMember {
  user_email: string;
  role: string;
  joined_at: string;
  invited_by?: string | null;
}

export interface AddTeamMemberRequest {
  email: string;
  role: string;
}

export interface UpdateTeamMemberRequest {
  role: string;
}
