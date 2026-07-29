import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  NON_CONFLICTING_PROPOSAL_STATUSES,
  PROPOSALS_PAGE_SIZE,
  type ProposalStatus,
} from "./constants";
import type {
  LeadProposalCandidate,
  ProposalDetail,
  ProposalFilters,
  ProposalListItem,
  ProposalPageData,
} from "./types";

const PROPOSAL_LIST_COLUMNS =
  "id, organization_id, lead_id, client_id, proposal_number, title, summary, scope, deliverables, timeline_text, payment_terms_text, terms_text, status, currency, subtotal, discount, tax, total, valid_until, requested_changes_message, sent_at, viewed_at, accepted_at, declined_at, created_by, created_at, updated_at, leads!proposals_lead_id_fkey(full_name, business_name), clients!proposals_client_id_fkey(business_name)";

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

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface ProposalJoinRow {
  id: string;
  organization_id: string;
  lead_id: string | null;
  client_id: string | null;
  proposal_number: string | null;
  title: string;
  summary: string | null;
  scope: string | null;
  deliverables: unknown;
  timeline_text: string | null;
  payment_terms_text: string | null;
  terms_text: string | null;
  status: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  valid_until: string | null;
  requested_changes_message: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  leads:
    | { full_name: string; business_name: string | null }
    | { full_name: string; business_name: string | null }[]
    | null;
  clients:
    | { business_name: string }
    | { business_name: string }[]
    | null;
}

function leadDisplayName(
  leads: ProposalJoinRow["leads"],
): string | null {
  const lead = firstOrNull(leads);
  if (!lead) return null;
  return lead.business_name || lead.full_name;
}

function clientDisplayName(
  clients: ProposalJoinRow["clients"],
): string | null {
  return firstOrNull(clients)?.business_name ?? null;
}

export async function getProposalPage(
  organizationId: string,
  filters: ProposalFilters,
): Promise<ProposalPageData> {
  const supabase = await createClient();
  const from = (filters.page - 1) * PROPOSALS_PAGE_SIZE;
  const to = from + PROPOSALS_PAGE_SIZE - 1;
  let query = supabase
    .from("proposals")
    .select(PROPOSAL_LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    logSupabaseError("getProposalPage", error);
    throw new Error("Unable to load proposals.");
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as ProposalJoinRow[];

  return {
    proposals: rows.map((proposal) => ({
      ...proposal,
      status: proposal.status as ProposalStatus,
      leadName: leadDisplayName(proposal.leads),
      clientName: clientDisplayName(proposal.clients),
    })) as ProposalListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PROPOSALS_PAGE_SIZE)),
  };
}

export async function getProposalDetail(
  organizationId: string,
  proposalId: string,
): Promise<ProposalDetail | null> {
  const supabase = await createClient();
  const { data: proposal, error: proposalError } = await supabase
    .from("proposals")
    .select(PROPOSAL_LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", proposalId)
    .maybeSingle();

  if (proposalError) {
    logSupabaseError("getProposalDetail.proposal", proposalError);
    throw new Error("Unable to load this proposal.");
  }

  if (!proposal) {
    return null;
  }

  const [itemsResult, versionsResult] = await Promise.all([
    supabase
      .from("proposal_items")
      .select(
        "id, proposal_id, name, description, quantity, unit_price, sort_order, created_at",
      )
      .eq("proposal_id", proposalId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("proposal_versions")
      .select("id, proposal_id, version_number, snapshot, created_by, created_at")
      .eq("proposal_id", proposalId)
      .order("version_number", { ascending: false }),
  ]);

  if (itemsResult.error) {
    logSupabaseError("getProposalDetail.items", itemsResult.error);
    throw new Error("Unable to load proposal line items.");
  }

  if (versionsResult.error) {
    logSupabaseError("getProposalDetail.versions", versionsResult.error);
    throw new Error("Unable to load proposal versions.");
  }

  const proposalRow = proposal as unknown as ProposalJoinRow;

  return {
    ...proposalRow,
    status: proposalRow.status as ProposalStatus,
    leadName: leadDisplayName(proposalRow.leads),
    clientName: clientDisplayName(proposalRow.clients),
    items: itemsResult.data ?? [],
    versions: versionsResult.data ?? [],
  } as ProposalDetail;
}

export interface EligibleLeadOption {
  id: string;
  label: string;
}

export async function getEligibleLeadOptions(
  organizationId: string,
): Promise<EligibleLeadOption[]> {
  const supabase = await createClient();

  const { data: conflicting, error: conflictingError } = await supabase
    .from("proposals")
    .select("lead_id")
    .eq("organization_id", organizationId)
    .not("lead_id", "is", null)
    .not("status", "in", `(${NON_CONFLICTING_PROPOSAL_STATUSES.join(",")})`);

  if (conflictingError) {
    logSupabaseError("getEligibleLeadOptions.conflicting", conflictingError);
    throw new Error("Unable to load qualified leads.");
  }

  const conflictingLeadIds = [
    ...new Set(
      (conflicting ?? [])
        .map((proposal) => proposal.lead_id)
        .filter((leadId): leadId is string => leadId !== null),
    ),
  ];

  let query = supabase
    .from("leads")
    .select("id, full_name, business_name, service_interest")
    .eq("organization_id", organizationId)
    .eq("status", "qualified");

  if (conflictingLeadIds.length > 0) {
    query = query.not("id", "in", `(${conflictingLeadIds.join(",")})`);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    logSupabaseError("getEligibleLeadOptions", error);
    throw new Error("Unable to load qualified leads.");
  }

  return (data ?? []).map((lead) => ({
    id: lead.id,
    label: lead.business_name
      ? `${lead.business_name} (${lead.full_name}) — ${lead.service_interest}`
      : `${lead.full_name} — ${lead.service_interest}`,
  }));
}

export async function getLeadProposalCandidate(
  organizationId: string,
  leadId: string,
): Promise<LeadProposalCandidate | null> {
  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id, full_name, business_name, email, service_interest, problem_summary, status",
    )
    .eq("organization_id", organizationId)
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getLeadProposalCandidate", error);
    throw new Error("Unable to load this lead.");
  }

  if (!lead) {
    return null;
  }

  return {
    id: lead.id,
    fullName: lead.full_name,
    businessName: lead.business_name,
    email: lead.email,
    serviceInterest: lead.service_interest,
    problemSummary: lead.problem_summary,
    status: lead.status,
  };
}
