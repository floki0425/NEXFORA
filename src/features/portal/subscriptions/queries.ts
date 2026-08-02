import "server-only";

import type {
  BillingCycle,
  SubscriptionStatus,
} from "@/features/subscriptions/constants";
import type {
  ClientSubscriptionRpcRow,
  ClientSubscriptionUsageRpcRow,
} from "@/features/subscriptions/database";
import { createSubscriptionClient } from "@/features/subscriptions/database";
import { requirePortalMember } from "@/lib/auth/portal";

import { getPortalProjects } from "../projects/queries";
import { portalSubscriptionIdSchema } from "./schemas";
import type {
  PortalSubscriptionDetail,
  PortalSubscriptionListItem,
} from "./types";

function asNumber(value: number | string | null): number {
  if (value === null) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSubscription(
  row: ClientSubscriptionRpcRow,
  projectNames: Map<string, string>,
): PortalSubscriptionListItem {
  return {
    id: row.id,
    planName: row.plan_name,
    status: row.status as SubscriptionStatus,
    billingCycle: row.billing_cycle as BillingCycle,
    amount: asNumber(row.amount),
    currency: row.currency,
    includedHours:
      row.included_hours === null ? null : asNumber(row.included_hours),
    usedHours: asNumber(row.used_hours),
    remainingHours:
      row.remaining_hours === null ? null : asNumber(row.remaining_hours),
    projectId: row.project_id,
    projectName: row.project_id
      ? (projectNames.get(row.project_id) ?? "Linked project")
      : null,
    startedAt: row.started_at,
    renewalAt: row.renewal_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}

export async function getPortalSubscriptions(): Promise<
  PortalSubscriptionListItem[]
> {
  await requirePortalMember();
  const supabase = await createSubscriptionClient();
  const [subscriptionResult, projects] = await Promise.all([
    supabase.rpc("get_client_subscriptions"),
    getPortalProjects(),
  ]);

  if (subscriptionResult.error) {
    throw new Error("Unable to load your maintenance plans.");
  }

  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );

  return ((subscriptionResult.data ?? []) as ClientSubscriptionRpcRow[]).map(
    (row) => mapSubscription(row, projectNames),
  );
}

export async function getPortalSubscriptionDetail(
  subscriptionId: string,
): Promise<PortalSubscriptionDetail | null> {
  const idResult = portalSubscriptionIdSchema.safeParse(subscriptionId);
  if (!idResult.success) {
    return null;
  }

  await requirePortalMember();
  const supabase = await createSubscriptionClient();
  const [subscriptionResult, projects] = await Promise.all([
    supabase.rpc("get_client_subscription", {
      target_subscription_id: idResult.data,
    }),
    getPortalProjects(),
  ]);

  if (subscriptionResult.error) {
    throw new Error("Unable to load this maintenance plan.");
  }

  const row = (subscriptionResult.data?.[0] ?? null) as
    | ClientSubscriptionRpcRow
    | null;
  if (!row) {
    return null;
  }

  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );
  const subscription = mapSubscription(row, projectNames);
  const { data, error } = await supabase.rpc(
    "get_client_subscription_usage",
    { target_subscription_id: idResult.data },
  );

  if (error) {
    throw new Error("Unable to load this maintenance plan's usage history.");
  }

  return {
    ...subscription,
    usage: ((data ?? []) as ClientSubscriptionUsageRpcRow[]).map((entry) => ({
      id: entry.id,
      description: entry.description,
      hoursUsed: asNumber(entry.hours_used),
      usageDate: entry.usage_date,
      createdAt: entry.created_at,
    })),
  };
}
