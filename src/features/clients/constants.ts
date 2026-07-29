import type { BadgeVariant } from "@/components/ui/badge";

export const CLIENT_MANAGER_ROLES = ["super_admin", "admin"] as const;

export const CLIENT_STATUSES = [
  "active",
  "inactive",
  "archived",
] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export const CLIENT_STATUS_BADGES: Record<ClientStatus, BadgeVariant> = {
  active: "success",
  inactive: "warning",
  archived: "neutral",
};

export const CLIENTS_PAGE_SIZE = 20;
