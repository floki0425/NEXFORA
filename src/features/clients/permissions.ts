import type { InternalMember, InternalRole } from "@/lib/auth/types";

import { CLIENT_MANAGER_ROLES } from "./constants.ts";
import type { ClientAccessContext } from "./types";

export function canManageClients(role: InternalRole): boolean {
  return CLIENT_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export function canReadClient(
  context: ClientAccessContext | null,
  clientOrganizationId: string,
): boolean {
  return (
    context !== null &&
    context.status === "active" &&
    context.organizationId === clientOrganizationId
  );
}

export function canMutateClient(
  context: ClientAccessContext | null,
  clientOrganizationId: string,
): boolean {
  return (
    context !== null &&
    canReadClient(context, clientOrganizationId) &&
    canManageClients(context.role)
  );
}

export function canConvertLeadToClient(
  role: InternalRole,
  leadStatus: string,
  convertedClientId: string | null,
): boolean {
  return (
    canManageClients(role) &&
    leadStatus === "won" &&
    convertedClientId === null
  );
}

export function isAllowedClientStatusEdit(
  currentStatus: string,
  nextStatus: string,
): boolean {
  if (currentStatus === "archived" || nextStatus === "archived") {
    return currentStatus === nextStatus;
  }

  return true;
}

export function memberCanManageClients(member: InternalMember): boolean {
  return canManageClients(member.role);
}
