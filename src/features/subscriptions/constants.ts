import type { BadgeVariant } from "@/components/ui/badge";

export const SUBSCRIPTION_MANAGER_ROLES = ["super_admin", "admin"] as const;

export const SUBSCRIPTION_USAGE_ROLES = [
  "super_admin",
  "admin",
  "project_manager",
] as const;

export const SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "past_due",
  "paused",
  "cancelled",
  "expired",
] as const;

// A cancelled subscription must set cancelled_at in the same UPDATE. The
// authenticated INSERT grant intentionally does not expose that column, so a
// new subscription cannot begin in the cancelled state.
export const SUBSCRIPTION_CREATE_STATUSES = [
  "trial",
  "active",
  "past_due",
  "paused",
  "expired",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const SUBSCRIPTION_STATUS_BADGES: Record<
  SubscriptionStatus,
  BadgeVariant
> = {
  trial: "info",
  active: "success",
  past_due: "error",
  paused: "warning",
  cancelled: "neutral",
  expired: "neutral",
};

export const BILLING_CYCLES = [
  "monthly",
  "quarterly",
  "yearly",
  "custom",
] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

export const SUBSCRIPTIONS_PAGE_SIZE = 20;
export const SUBSCRIPTION_CURRENCY_DEFAULT = "PHP";
