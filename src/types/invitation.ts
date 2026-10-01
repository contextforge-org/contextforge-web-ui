/** What the user did to an invitation. Absent means it is still actionable. */
export type InvitationResolution = "accepted" | "declined";

/** Which request is currently open against an invitation. */
export type InvitationAction = "accept" | "decline";
