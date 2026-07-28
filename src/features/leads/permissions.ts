import type { InternalMember, InternalRole } from "@/lib/auth/types";

import { LEAD_MANAGER_ROLES } from "./constants.ts";
import type { LeadAccessContext } from "./types";

export function canManageLeads(role: InternalRole): boolean {
  return LEAD_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export function canReadLead(
  context: LeadAccessContext | null,
  leadOrganizationId: string,
): boolean {
  return (
    context !== null &&
    context.status === "active" &&
    context.organizationId === leadOrganizationId
  );
}

export function canMutateLead(
  context: LeadAccessContext | null,
  leadOrganizationId: string,
): boolean {
  return (
    context !== null &&
    canReadLead(context, leadOrganizationId) &&
    canManageLeads(context.role)
  );
}

export function memberCanManageLeads(member: InternalMember): boolean {
  return canManageLeads(member.role);
}
