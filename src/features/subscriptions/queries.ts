import "server-only";

import { AuthorizationDeniedError } from "@/lib/auth/errors";
import { requireInternalMember } from "@/lib/auth/server";

import { SUBSCRIPTIONS_PAGE_SIZE } from "./constants";
import type { SubscriptionRow, SubscriptionUsageRow } from "./database";
import { createSubscriptionClient } from "./database";
import { roundHours } from "./format";
import { memberCanManageSubscriptions } from "./permissions";
import { subscriptionIdSchema } from "./schemas";
import type {
  SubscriptionDetail,
  SubscriptionFilters,
  SubscriptionFormOptions,
  SubscriptionListItem,
  SubscriptionPageData,
  SubscriptionUsageItem,
} from "./types";
import type { BillingCycle, SubscriptionStatus } from "./constants";

interface SupabaseErrorDetails {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function logSupabaseError(
  operation: string,
  error: SupabaseErrorDetails,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}

function safeSearchValue(value: string): string {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

function asNumber(value: number | string | null): number {
  if (value === null) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function resolveClientNames(
  clientIds: readonly string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(clientIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const supabase = await createSubscriptionClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name")
    .in("id", uniqueIds);

  if (error) {
    logSupabaseError("resolveSubscriptionClientNames", error);
    throw new Error("Unable to load subscription clients.");
  }

  return new Map((data ?? []).map((client) => [client.id, client.business_name]));
}

async function resolveProjectNames(
  projectIds: readonly string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(projectIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const supabase = await createSubscriptionClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .in("id", uniqueIds);

  if (error) {
    logSupabaseError("resolveSubscriptionProjectNames", error);
    throw new Error("Unable to load subscription projects.");
  }

  return new Map((data ?? []).map((project) => [project.id, project.name]));
}

async function resolveUsageTotals(
  subscriptionIds: readonly string[],
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(subscriptionIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const supabase = await createSubscriptionClient();
  const totalsInHundredths = new Map<string, number>();
  const pageSize = 500;
  let from = 0;

  while (true) {
    const { data, count, error } = await supabase
      .from("subscription_usage")
      .select("id, subscription_id, hours_used", { count: "exact" })
      .in("subscription_id", uniqueIds)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      logSupabaseError("resolveSubscriptionUsageTotals", error);
      throw new Error("Unable to calculate subscription usage.");
    }

    const rows = data ?? [];
    for (const entry of rows) {
      totalsInHundredths.set(
        entry.subscription_id,
        (totalsInHundredths.get(entry.subscription_id) ?? 0) +
          Math.round(asNumber(entry.hours_used) * 100),
      );
    }

    from += rows.length;
    if (rows.length === 0 || (count !== null && from >= count)) {
      break;
    }
  }

  return new Map(
    [...totalsInHundredths].map(([subscriptionId, hundredths]) => [
      subscriptionId,
      hundredths / 100,
    ]),
  );
}

function mapSubscription(
  row: SubscriptionRow,
  clientNames: Map<string, string>,
  projectNames: Map<string, string>,
  usageTotals: Map<string, number>,
): SubscriptionListItem {
  const usedHours = usageTotals.get(row.id) ?? 0;
  const includedHours =
    row.included_hours === null ? null : asNumber(row.included_hours);

  return {
    ...row,
    amount: asNumber(row.amount),
    included_hours: includedHours,
    status: row.status as SubscriptionStatus,
    billing_cycle: row.billing_cycle as BillingCycle,
    clientName: clientNames.get(row.client_id) ?? "Unknown client",
    projectName: row.project_id
      ? (projectNames.get(row.project_id) ?? "Unknown project")
      : null,
    usedHours,
    remainingHours:
      includedHours === null ? null : roundHours(includedHours - usedHours),
  };
}

export async function getSubscriptionPage(
  filters: SubscriptionFilters,
): Promise<SubscriptionPageData> {
  const member = await requireInternalMember();
  const supabase = await createSubscriptionClient();
  const from = (filters.page - 1) * SUBSCRIPTIONS_PAGE_SIZE;
  const to = from + SUBSCRIPTIONS_PAGE_SIZE - 1;

  let query = supabase
    .from("subscriptions")
    .select("*", { count: "exact" })
    .eq("organization_id", member.organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.ilike("plan_name", `%${search}%`);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    logSupabaseError("getSubscriptionPage", error);
    throw new Error("Unable to load maintenance subscriptions.");
  }

  const rows = (data ?? []) as SubscriptionRow[];
  const [clientNames, projectNames, usageTotals] = await Promise.all([
    resolveClientNames(rows.map((row) => row.client_id)),
    resolveProjectNames(
      rows.map((row) => row.project_id).filter((id): id is string => Boolean(id)),
    ),
    resolveUsageTotals(rows.map((row) => row.id)),
  ]);
  const total = count ?? 0;

  return {
    subscriptions: rows.map((row) =>
      mapSubscription(row, clientNames, projectNames, usageTotals),
    ),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / SUBSCRIPTIONS_PAGE_SIZE)),
  };
}

export async function getSubscriptionDetail(
  subscriptionId: string,
): Promise<SubscriptionDetail | null> {
  const parsedId = subscriptionIdSchema.safeParse(subscriptionId);
  if (!parsedId.success) {
    return null;
  }

  const member = await requireInternalMember();
  const supabase = await createSubscriptionClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", parsedId.data)
    .eq("organization_id", member.organizationId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getSubscriptionDetail.subscription", error);
    throw new Error("Unable to load this maintenance subscription.");
  }

  if (!data) {
    return null;
  }

  const row = data as SubscriptionRow;
  const [clientNames, projectNames, usageResult, usageTotals] = await Promise.all([
    resolveClientNames([row.client_id]),
    resolveProjectNames(row.project_id ? [row.project_id] : []),
    supabase
      .from("subscription_usage")
      .select("*")
      .eq("subscription_id", row.id)
      .eq("organization_id", member.organizationId)
      .order("usage_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    resolveUsageTotals([row.id]),
  ]);

  if (usageResult.error) {
    logSupabaseError("getSubscriptionDetail.usage", usageResult.error);
    throw new Error("Unable to load maintenance usage history.");
  }

  const usageRows = (usageResult.data ?? []) as SubscriptionUsageRow[];
  const recorderIds = usageRows
    .map((entry) => entry.recorded_by)
    .filter((id): id is string => Boolean(id));
  const recorderNames = new Map<string, string>();

  if (recorderIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(recorderIds)]);

    if (profileError) {
      logSupabaseError("getSubscriptionDetail.recorders", profileError);
      throw new Error("Unable to load maintenance usage history.");
    }

    for (const profile of profiles ?? []) {
      recorderNames.set(profile.id, profile.full_name);
    }
  }

  const usage: SubscriptionUsageItem[] = usageRows.map((entry) => ({
    ...entry,
    hours_used: asNumber(entry.hours_used),
    recorderName: entry.recorded_by
      ? (recorderNames.get(entry.recorded_by) ?? null)
      : null,
  }));
  return {
    ...mapSubscription(row, clientNames, projectNames, usageTotals),
    usage,
  };
}

export async function getSubscriptionFormOptions(): Promise<
  SubscriptionFormOptions
> {
  const member = await requireInternalMember();
  if (!memberCanManageSubscriptions(member)) {
    throw new AuthorizationDeniedError();
  }

  const supabase = await createSubscriptionClient();
  const [clientResult, projectResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, business_name")
      .eq("organization_id", member.organizationId)
      .eq("status", "active")
      .order("business_name", { ascending: true })
      .limit(200),
    supabase
      .from("projects")
      .select("id, name, client_id")
      .eq("organization_id", member.organizationId)
      .order("name", { ascending: true })
      .limit(500),
  ]);

  if (clientResult.error) {
    logSupabaseError("getSubscriptionFormOptions.clients", clientResult.error);
    throw new Error("Unable to load clients.");
  }

  if (projectResult.error) {
    logSupabaseError("getSubscriptionFormOptions.projects", projectResult.error);
    throw new Error("Unable to load projects.");
  }

  return {
    clients: (clientResult.data ?? []).map((client) => ({
      id: client.id,
      label: client.business_name,
    })),
    projects: (projectResult.data ?? []).map((project) => ({
      id: project.id,
      label: project.name,
      clientId: project.client_id,
    })),
  };
}
