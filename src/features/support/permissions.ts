import type { InternalMember } from "@/lib/auth/types";

export function canCreateInternalSupportTicket(
  member: InternalMember,
): boolean {
  return member.role === "super_admin" || member.role === "admin";
}

export interface SupportTicketPermissionContext {
  assignedTo: string | null;
  hasProjectAccess: boolean;
}

export function canAssignSupportTicket(
  member: InternalMember,
  context: SupportTicketPermissionContext,
): boolean {
  if (member.role === "super_admin" || member.role === "admin") {
    return true;
  }

  // The follow-up RLS policy's WITH CHECK requires the post-update ticket to
  // remain on a project this manager can manage. A self-assigned general
  // ticket may be worked, but cannot be reassigned to somebody else.
  return member.role === "project_manager" && context.hasProjectAccess;
}

export function canTransitionSupportTicket(
  member: InternalMember,
  context: SupportTicketPermissionContext,
): boolean {
  if (member.role === "team_member") {
    return context.assignedTo === member.profileId;
  }

  if (member.role === "project_manager") {
    return (
      context.assignedTo === member.profileId || context.hasProjectAccess
    );
  }

  return true;
}
