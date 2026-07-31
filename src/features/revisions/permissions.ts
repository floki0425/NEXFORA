import type { InternalMember } from "@/lib/auth/types";

import type { RevisionAssignContext } from "./types";

/**
 * Mirrors the revisions_update_assignment RLS policy in the Phase 8
 * migration: only super_admin/admin, or a project_manager who manages or is
 * a member of the project, may (re)assign a revision. team_member is
 * deliberately excluded — they may update the status of a revision assigned
 * to them, but may not reassign it.
 */
export function canAssignRevision(
  member: InternalMember,
  context: RevisionAssignContext,
): boolean {
  if (member.role === "super_admin" || member.role === "admin") {
    return true;
  }

  if (member.role === "project_manager") {
    return (
      context.projectManagerId === member.profileId || context.isProjectMember
    );
  }

  return false;
}

/**
 * Mirrors public.transition_revision_status()'s authorization check exactly:
 * super_admin/admin always; project_manager only for an accessible project;
 * team_member only for a revision currently assigned to them.
 */
export function canTransitionRevisionStatus(
  member: InternalMember,
  context: RevisionAssignContext,
  assignedTo: string | null,
): boolean {
  if (member.role === "super_admin" || member.role === "admin") {
    return true;
  }

  if (member.role === "project_manager") {
    return (
      context.projectManagerId === member.profileId || context.isProjectMember
    );
  }

  if (member.role === "team_member") {
    return assignedTo === member.profileId;
  }

  return false;
}
