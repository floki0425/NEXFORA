import { CLIENT_ROLES, type ClientRole } from "../../lib/auth/types.ts";

export { CLIENT_ROLES, type ClientRole };

export const CLIENT_MANAGER_ROLES = ["super_admin", "admin"] as const;

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  owner: "Owner",
  manager: "Manager",
  viewer: "Viewer",
};

export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "revoked",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
};

// Admin-selectable expiration windows for a new invitation. Bounded to sane
// choices rather than an open-ended date input — the server independently
// re-validates the resulting absolute expiration is in the future.
export const CLIENT_INVITATION_TTL_DAYS_OPTIONS = [3, 7, 14, 30] as const;

export const CLIENT_INVITATION_DEFAULT_TTL_DAYS = 7;
