import type { InternalMember, InternalRole } from "@/lib/auth/types";

import { CLIENT_MANAGER_ROLES } from "./constants.ts";

export function canManageClientInvitations(role: InternalRole): boolean {
  return CLIENT_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export function memberCanManageClientInvitations(
  member: InternalMember,
): boolean {
  return canManageClientInvitations(member.role);
}
