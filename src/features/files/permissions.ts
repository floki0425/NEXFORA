import type { InternalMember } from "@/lib/auth/types";

import type { ProjectFileAccessContext } from "./types";

/**
 * Mirrors private.can_manage_project() in the Phase 8 migration exactly —
 * this is the application-layer copy of the same rule, not a separate
 * decision. Both layers must independently authorize (AGENTS.md §8), so this
 * check exists even though the database RLS/RPC functions would reject an
 * unauthorized upload anyway.
 *
 * Documented decision (not explicit in FEATURES.md/DATABASE.md):
 * - super_admin, admin: may upload/manage files for any project in the org.
 * - project_manager: only for a project they manage (project_manager_id) or
 *   are a project_members row for.
 * - team_member: only for a project they are a project_members row for.
 */
export function canManageProjectFiles(
  member: InternalMember,
  context: ProjectFileAccessContext,
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
    return context.isProjectMember;
  }

  return false;
}
