import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  CLIENTS_PAGE_SIZE,
  type ClientStatus,
} from "./constants";
import type {
  ClientDetail,
  ClientFilters,
  ClientListItem,
  ClientPageData,
  LeadConversionCandidate,
} from "./types";

const CLIENT_COLUMNS =
  "id, organization_id, source_lead_id, business_name, contact_name, email, phone, industry, website_url, billing_address, notes, status, created_at, updated_at";

function safeSearchValue(value: string): string {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

export async function getClientPage(
  organizationId: string,
  filters: ClientFilters,
): Promise<ClientPageData> {
  const supabase = await createClient();
  const from = (filters.page - 1) * CLIENTS_PAGE_SIZE;
  const to = from + CLIENTS_PAGE_SIZE - 1;
  let query = supabase
    .from("clients")
    .select(CLIENT_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.or(
      `business_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`,
    );
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("Unable to load clients.");
  }

  const total = count ?? 0;

  return {
    clients: (data ?? []).map((client) => ({
      ...client,
      status: client.status as ClientStatus,
    })) as ClientListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
  };
}

export async function getClientDetail(
  organizationId: string,
  clientId: string,
): Promise<ClientDetail | null> {
  const supabase = await createClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", clientId)
    .maybeSingle();

  if (clientError) {
    throw new Error("Unable to load this client.");
  }

  if (!client) {
    return null;
  }

  let sourceLead: ClientDetail["sourceLead"] = null;

  if (client.source_lead_id) {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, full_name, business_name")
      .eq("organization_id", organizationId)
      .eq("id", client.source_lead_id)
      .maybeSingle();

    if (leadError) {
      throw new Error("Unable to load this client's source lead.");
    }

    if (lead) {
      sourceLead = {
        id: lead.id,
        fullName: lead.full_name,
        businessName: lead.business_name,
      };
    }
  }

  return {
    ...client,
    status: client.status as ClientStatus,
    sourceLead,
  } as ClientDetail;
}

export async function getLeadConversionCandidate(
  organizationId: string,
  leadId: string,
): Promise<LeadConversionCandidate | null> {
  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id, full_name, business_name, email, phone, industry, status, converted_client_id",
    )
    .eq("organization_id", organizationId)
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
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
    phone: lead.phone,
    industry: lead.industry,
    status: lead.status,
    convertedClientId: lead.converted_client_id,
  };
}
