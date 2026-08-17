import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  LEADS_PAGE_SIZE,
  type LeadSource,
  type LeadStatus,
} from "./constants";
import type {
  LeadActivityItem,
  LeadDetail,
  LeadFilters,
  LeadListItem,
  LeadPageData,
  MemberOption,
} from "./types";

const LEAD_COLUMNS =
  "id, organization_id, full_name, business_name, email, phone, industry, service_interest, problem_summary, requested_features, budget_min, budget_max, target_timeline, source, source_detail, status, lead_score, assigned_to, lost_reason, converted_client_id, converted_at, created_at, updated_at";

function safeSearchValue(value: string): string {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

async function getProfileNames(
  profileIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(profileIds.filter(Boolean))];

  if (ids.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  if (error) {
    throw new Error("Unable to load team member names.");
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}

export async function getLeadPage(
  organizationId: string,
  filters: LeadFilters,
): Promise<LeadPageData> {
  const supabase = await createClient();
  const from = (filters.page - 1) * LEADS_PAGE_SIZE;
  const to = from + LEADS_PAGE_SIZE - 1;
  let query = supabase
    .from("leads")
    .select(LEAD_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,business_name.ilike.%${search}%,email.ilike.%${search}%`,
    );
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.source) {
    query = query.eq("source", filters.source);
  }

  if (filters.assignedTo) {
    query = query.eq("assigned_to", filters.assignedTo);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("Unable to load leads.");
  }

  const profileNames = await getProfileNames(
    (data ?? []).flatMap((lead) =>
      lead.assigned_to ? [lead.assigned_to] : [],
    ),
  );
  const total = count ?? 0;

  return {
    leads: (data ?? []).map((lead) => ({
      ...lead,
      status: lead.status as LeadStatus,
      source: lead.source as LeadSource,
      assigneeName: lead.assigned_to
        ? (profileNames.get(lead.assigned_to) ?? null)
        : null,
    })) as LeadListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
  };
}

export async function getLeadDetail(
  organizationId: string,
  leadId: string,
): Promise<LeadDetail | null> {
  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    throw new Error("Unable to load this lead.");
  }

  if (!lead) {
    return null;
  }

  const { data: activities, error: activitiesError } = await supabase
    .from("lead_activities")
    .select(
      "id, organization_id, lead_id, activity_type, title, description, metadata, created_by, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (activitiesError) {
    throw new Error("Unable to load lead activity.");
  }

  // Present only for leads forwarded from the public website's "Start a
  // Project" form; every other lead returns no row, which is not an error.
  // The ledger's identifiers are never selected — see WebsiteInquiryDetail.
  const { data: websiteInquiry, error: websiteInquiryError } = await supabase
    .from("website_inquiry_imports")
    .select(
      "preferred_contact_method, service_needed, estimated_budget, target_timeline, submitted_at",
    )
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (websiteInquiryError) {
    throw new Error("Unable to load the website inquiry for this lead.");
  }

  const profileIds = [
    ...(lead.assigned_to ? [lead.assigned_to] : []),
    ...(activities ?? []).flatMap((activity) =>
      activity.created_by ? [activity.created_by] : [],
    ),
  ];
  const profileNames = await getProfileNames(profileIds);

  return {
    ...lead,
    status: lead.status as LeadStatus,
    source: lead.source as LeadSource,
    assigneeName: lead.assigned_to
      ? (profileNames.get(lead.assigned_to) ?? null)
      : null,
    activities: (activities ?? []).map((activity) => ({
      ...activity,
      authorName: activity.created_by
        ? (profileNames.get(activity.created_by) ?? null)
        : null,
    })) as LeadActivityItem[],
    websiteInquiry: websiteInquiry
      ? {
          preferredContactMethod: websiteInquiry.preferred_contact_method,
          serviceNeeded: websiteInquiry.service_needed,
          estimatedBudget: websiteInquiry.estimated_budget,
          targetTimeline: websiteInquiry.target_timeline,
          submittedAt: websiteInquiry.submitted_at,
        }
      : null,
  } as LeadDetail;
}

export async function getMemberOptions(): Promise<MemberOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error("Unable to load team members.");
  }

  return (data ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
  }));
}
