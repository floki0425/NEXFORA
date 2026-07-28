export const INTERNAL_ROLES = [
  "super_admin",
  "admin",
  "project_manager",
  "team_member",
] as const;

export type InternalRole = (typeof INTERNAL_ROLES)[number];

export interface CurrentProfile {
  id: string;
  authUserId: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: "active";
}

export interface InternalMember {
  membershipId: string;
  organizationId: string;
  profileId: string;
  role: InternalRole;
  status: "active";
  profile: CurrentProfile;
  organization: OrganizationSummary;
}
