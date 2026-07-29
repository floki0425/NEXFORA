import type { InternalMember, InternalRole } from "@/lib/auth/types";

import { PROJECT_MANAGER_ROLES } from "./constants.ts";
import type { ProjectAccessContext } from "./types";

export function canManageProjects(role: InternalRole): boolean {
  return PROJECT_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export function canReadProject(
  context: ProjectAccessContext | null,
  projectOrganizationId: string,
): boolean {
  return (
    context !== null &&
    context.status === "active" &&
    context.organizationId === projectOrganizationId
  );
}

export function canMutateProject(
  context: ProjectAccessContext | null,
  projectOrganizationId: string,
): boolean {
  return (
    context !== null &&
    canReadProject(context, projectOrganizationId) &&
    canManageProjects(context.role)
  );
}

export function memberCanManageProjects(member: InternalMember): boolean {
  return canManageProjects(member.role);
}
