import { useState, useCallback, useEffect } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import {
  listTeamMembers,
  addTeamMember,
  inviteTeamMember,
  updateTeamMember,
  removeTeamMember,
} from "@/api/teams";
import type { ComboboxOption } from "@/components/ui/combobox";
import type { TeamMember } from "@/types/team";
import type { UsersResponse } from "@/types/user";
import { copyToClipboard } from "@/lib/clipboard";
import { extractApiErrorDetail, sanitizeError } from "@/utils/errors";

export const AVAILABLE_ROLES = ["owner", "member"] as const;
type TeamRole = (typeof AVAILABLE_ROLES)[number];

/**
 * Narrows a row's role to the API's strict union. `MemberRow.role` is plain
 * `string` (it round-trips through a generic `<select>`), but the role Select
 * only ever offers `AVAILABLE_ROLES`, so this is just a type-safe cast with a
 * defensive fallback rather than real runtime validation.
 */
function toTeamRole(role: string): TeamRole {
  return role === "owner" ? "owner" : "member";
}

export interface MemberRow {
  id: string;
  email: string;
  role: string;
  isExisting: boolean;
}

/** Creates a blank, editable member row for a not-yet-added member. */
function createEmptyRow(): MemberRow {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    email: "",
    role: "member",
    isExisting: false,
  };
}

export interface UseTeamMembersFormOptions {
  /** Whether the dialog is open; members are (re)loaded when this becomes true. */
  open: boolean;
  /** Team whose members are being managed. */
  teamId: string;
  /** Called after a successful save that resulted in at least one change. */
  onSuccess?: () => void;
  /** Called after a successful save to close the dialog. */
  onClose: () => void;
}

/**
 * Owns the state and API orchestration for the Manage Team Members dialog:
 * loading existing members, the editable rows, and diffing rows against the
 * originally loaded members to add / update roles / remove on save.
 */
export function useTeamMembersForm({
  open,
  teamId,
  onSuccess,
  onClose,
}: UseTeamMembersFormOptions) {
  const intl = useIntl();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [originalMembers, setOriginalMembers] = useState<TeamMember[]>([]);
  const [memberOptions, setMemberOptions] = useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load the directory of users for the member email autocomplete.
  useEffect(() => {
    let cancelled = false;
    api
      .get<UsersResponse>("/auth/email/admin/users?limit=0&include_pagination=true")
      .then((response) => {
        if (cancelled) return;
        setMemberOptions(
          response.users.map((user) => ({
            value: user.email,
            label: user.full_name ? `${user.full_name} (${user.email})` : user.email,
            searchText: [user.full_name, user.email].filter(Boolean).join(" "),
          })),
        );
      })
      .catch((err) => {
        console.error("Failed to fetch users for member suggestions:", sanitizeError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load existing members when the dialog opens.
  useEffect(() => {
    if (open && teamId) {
      setIsLoading(true);
      listTeamMembers(teamId)
        .then((teamMembers) => {
          // Members without an inviter (invited_by null/empty) are not shown.
          const visibleMembers = teamMembers.filter((m) => Boolean(m.invited_by));
          const existingMembers: MemberRow[] = visibleMembers.map((m, idx) => ({
            id: `existing-${idx}`,
            email: m.user_email,
            role: m.role,
            isExisting: true,
          }));
          // Always show at least one editable row so members can be added.
          setMembers(existingMembers.length > 0 ? existingMembers : [createEmptyRow()]);
          setOriginalMembers(visibleMembers);
        })
        .catch((err) => {
          toast.error(intl.formatMessage({ id: "teams.members.error.load" }), {
            description: sanitizeError(err),
          });
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, teamId, intl]);

  const addRow = useCallback(() => {
    setMembers((prev) => [...prev, createEmptyRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const changeEmail = useCallback((id: string, email: string) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, email } : m)));
  }, []);

  const changeRole = useCallback((id: string, role: string) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
  }, []);

  const save = useCallback(async () => {
    setIsSaving(true);

    try {
      // New rows with an email → add.
      const membersToAdd = members.filter((m) => !m.isExisting && m.email.trim() !== "");

      // Existing members no longer present in the rows → remove.
      const currentEmails = new Set(members.map((m) => m.email.toLowerCase()));
      const membersToRemove = originalMembers.filter(
        (m) => !currentEmails.has(m.user_email.toLowerCase()),
      );

      // Existing members whose role changed → update.
      const originalRoleByEmail = new Map(
        originalMembers.map((m) => [m.user_email.toLowerCase(), m.role]),
      );
      const membersToUpdate = members.filter(
        (m) => m.isExisting && originalRoleByEmail.get(m.email.toLowerCase()) !== m.role,
      );

      // There is no "add-or-invite" endpoint for an existing team (only team
      // creation seeds both in one call), so each row is added directly and,
      // only when the address has no account (addTeamMember 404s with "User
      // not found"), falls back to sending an invitation instead.
      const addedEmails: string[] = [];
      const sentInvitationEmails: string[] = [];
      const undeliveredInvitations: Array<{
        email: string;
        invitationUrl: string;
        warning?: string | null;
      }> = [];
      for (const member of membersToAdd) {
        try {
          await addTeamMember(teamId, { email: member.email, role: member.role });
          addedEmails.push(member.email);
        } catch (err) {
          // 404 is also returned when the team itself is gone; only fall back
          // to inviting when the service specifically reported an unknown user.
          const isUnknownUser =
            err instanceof ApiError &&
            err.status === 404 &&
            extractApiErrorDetail(err.body) === "User not found";
          if (isUnknownUser) {
            const invitation = await inviteTeamMember(teamId, {
              email: member.email,
              role: toTeamRole(member.role),
            });
            // The invitation is always created even when the notification email
            // isn't; only report it as "sent" when delivery actually succeeded,
            // and surface the rest as a warning with a link to share manually.
            if (invitation.email_delivery_status === "sent") {
              sentInvitationEmails.push(invitation.email);
            } else {
              undeliveredInvitations.push({
                email: invitation.email,
                invitationUrl: invitation.invitation_url,
                warning: invitation.warning,
              });
            }
          } else {
            throw err;
          }
        }
      }

      for (const member of membersToUpdate) {
        await updateTeamMember(teamId, member.email, { role: member.role });
      }

      for (const member of membersToRemove) {
        await removeTeamMember(teamId, member.user_email);
      }

      const totalChanges =
        addedEmails.length +
        sentInvitationEmails.length +
        undeliveredInvitations.length +
        membersToUpdate.length +
        membersToRemove.length;
      if (totalChanges > 0) {
        toast.success(intl.formatMessage({ id: "teams.members.success" }, { count: totalChanges }));
        onSuccess?.();
      }

      // Report which addresses were added directly vs. invited, so the user
      // isn't left guessing what happened to each address.
      if (addedEmails.length > 0) {
        toast.success(
          intl.formatMessage({ id: "teams.members.membersAdded" }, { count: addedEmails.length }),
          { description: addedEmails.join(", ") },
        );
      }

      if (sentInvitationEmails.length > 0) {
        toast.success(
          intl.formatMessage(
            { id: "teams.members.invitationsSent" },
            { count: sentInvitationEmails.length },
          ),
          { description: sentInvitationEmails.join(", ") },
        );
      }

      for (const undelivered of undeliveredInvitations) {
        toast.warning(
          intl.formatMessage(
            { id: "teams.members.invitation.deliveryWarning" },
            { email: undelivered.email },
          ),
          {
            description:
              undelivered.warning ??
              intl.formatMessage({ id: "teams.members.invitation.deliveryWarning.description" }),
            action: {
              label: intl.formatMessage({ id: "common.button.copyLink" }),
              onClick: () => {
                void copyToClipboard(undelivered.invitationUrl);
              },
            },
          },
        );
      }

      onClose();
    } catch (err) {
      toast.error(intl.formatMessage({ id: "teams.members.error.save" }), {
        description: sanitizeError(err),
      });
    } finally {
      setIsSaving(false);
    }
  }, [members, originalMembers, teamId, intl, onSuccess, onClose]);

  return {
    // State
    members,
    memberOptions,
    isLoading,
    isSaving,

    // Row handlers
    addRow,
    removeRow,
    changeEmail,
    changeRole,

    // Save
    save,
  };
}
