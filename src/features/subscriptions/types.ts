import type {
  SubscriptionRow,
  SubscriptionUsageRow,
} from "./database";
import type { BillingCycle, SubscriptionStatus } from "./constants";

export interface SubscriptionListItem
  extends Omit<SubscriptionRow, "status" | "billing_cycle"> {
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  clientName: string;
  projectName: string | null;
  usedHours: number;
  remainingHours: number | null;
}

export interface SubscriptionUsageItem extends SubscriptionUsageRow {
  recorderName: string | null;
}

export interface SubscriptionDetail extends SubscriptionListItem {
  usage: SubscriptionUsageItem[];
}

export interface SubscriptionFilters {
  query: string;
  status: SubscriptionStatus | "";
  page: number;
}

export interface SubscriptionPageData {
  subscriptions: SubscriptionListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface SubscriptionActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
  subscriptionId?: string;
}

export interface SubscriptionClientOption {
  id: string;
  label: string;
}

export interface SubscriptionProjectOption {
  id: string;
  label: string;
  clientId: string;
}

export interface SubscriptionFormOptions {
  clients: SubscriptionClientOption[];
  projects: SubscriptionProjectOption[];
}
