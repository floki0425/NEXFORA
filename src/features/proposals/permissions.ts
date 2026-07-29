import type { InternalMember, InternalRole } from "@/lib/auth/types";

import {
  EDITABLE_PROPOSAL_STATUSES,
  PROPOSAL_ELIGIBLE_LEAD_STATUS,
  PROPOSAL_MANAGER_ROLES,
  type ProposalStatus,
} from "./constants.ts";
import type { ProposalAccessContext } from "./types";

export function canManageProposals(role: InternalRole): boolean {
  return PROPOSAL_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export function canReadProposal(
  context: ProposalAccessContext | null,
  proposalOrganizationId: string,
): boolean {
  return (
    context !== null &&
    context.status === "active" &&
    context.organizationId === proposalOrganizationId
  );
}

export function canMutateProposal(
  context: ProposalAccessContext | null,
  proposalOrganizationId: string,
): boolean {
  return (
    context !== null &&
    canReadProposal(context, proposalOrganizationId) &&
    canManageProposals(context.role)
  );
}

export function memberCanManageProposals(member: InternalMember): boolean {
  return canManageProposals(member.role);
}

export function isLeadEligibleForProposal(leadStatus: string): boolean {
  return leadStatus === PROPOSAL_ELIGIBLE_LEAD_STATUS;
}

export function isProposalEditable(status: ProposalStatus): boolean {
  return EDITABLE_PROPOSAL_STATUSES.includes(status);
}
