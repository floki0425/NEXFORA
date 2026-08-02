import type {
  BillingCycle,
  SubscriptionStatus,
} from "@/features/subscriptions/constants";

export interface PortalSubscriptionListItem {
  id: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  amount: number;
  currency: string;
  includedHours: number | null;
  usedHours: number;
  remainingHours: number | null;
  projectId: string | null;
  projectName: string | null;
  startedAt: string | null;
  renewalAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface PortalSubscriptionUsageItem {
  id: string;
  description: string;
  hoursUsed: number;
  usageDate: string;
  createdAt: string;
}

export interface PortalSubscriptionDetail extends PortalSubscriptionListItem {
  usage: PortalSubscriptionUsageItem[];
}
