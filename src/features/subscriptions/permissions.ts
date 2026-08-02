import type { InternalMember, InternalRole } from "@/lib/auth/types";

import {
  SUBSCRIPTION_MANAGER_ROLES,
  SUBSCRIPTION_USAGE_ROLES,
} from "./constants.ts";

export function canManageSubscriptions(role: InternalRole): boolean {
  return SUBSCRIPTION_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export function memberCanManageSubscriptions(member: InternalMember): boolean {
  return canManageSubscriptions(member.role);
}

export function canRecordSubscriptionUsage(role: InternalRole): boolean {
  return SUBSCRIPTION_USAGE_ROLES.some((allowedRole) => allowedRole === role);
}

export function memberCanRecordSubscriptionUsage(
  member: InternalMember,
): boolean {
  return canRecordSubscriptionUsage(member.role);
}
