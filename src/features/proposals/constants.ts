import type { BadgeVariant } from "@/components/ui/badge";

export const PROPOSAL_MANAGER_ROLES = ["super_admin", "admin"] as const;

export const PROPOSAL_ELIGIBLE_LEAD_STATUS = "qualified" as const;

export const PROPOSAL_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "changes_requested",
  "declined",
  "expired",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// A qualified lead whose only proposal(s) are in one of these statuses may
// still start a fresh proposal — the decision on the prior proposal is
// already finalized as void. Any other status (draft, sent, viewed,
// changes_requested, accepted) is an in-flight or completed engagement and
// blocks starting a second, competing proposal for the same lead.
export const NON_CONFLICTING_PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  "declined",
  "expired",
];

export const EDITABLE_PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  "draft",
  "changes_requested",
];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  changes_requested: "Changes requested",
  declined: "Declined",
  expired: "Expired",
};

export const PROPOSAL_STATUS_BADGES: Record<ProposalStatus, BadgeVariant> = {
  draft: "neutral",
  sent: "info",
  viewed: "accent",
  accepted: "success",
  changes_requested: "warning",
  declined: "error",
  expired: "neutral",
};

export const PROPOSALS_PAGE_SIZE = 20;

export const PROPOSAL_CURRENCY_DEFAULT = "PHP";

// How long a client access link stays technically valid. Independent of
// proposals.valid_until, which is the business-validity date checked
// separately when a client attempts to accept.
export const PROPOSAL_ACCESS_TOKEN_TTL_DAYS = 30;

export const PROPOSAL_DELIVERABLE_MAX_LENGTH = 160;
export const PROPOSAL_DELIVERABLES_MAX_COUNT = 50;
