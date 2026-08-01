import "server-only";

import { createClient } from "@/lib/supabase/server";

import { INVOICES_PAGE_SIZE, type InvoiceStatus } from "./constants";
import type {
  ClientOption,
  InvoiceDetail,
  InvoiceFilters,
  InvoiceListItem,
  InvoicePageData,
  ProjectOption,
} from "./types";

const INVOICE_LIST_COLUMNS =
  "id, organization_id, client_id, project_id, invoice_number, status, currency, subtotal, discount, tax, total, amount_paid, balance_due, issue_date, due_date, sent_at, viewed_at, paid_at, voided_at, notes, created_by, created_at, updated_at, clients!invoices_client_id_fkey(business_name)";

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

interface InvoiceJoinRow {
  id: string;
  organization_id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string | null;
  status: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  issue_date: string | null;
  due_date: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  clients: { business_name: string } | { business_name: string }[] | null;
}

function clientDisplayName(clients: InvoiceJoinRow["clients"]): string | null {
  return firstOrNull(clients)?.business_name ?? null;
}

async function resolveProjectNames(
  projectIds: readonly string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(projectIds)];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .in("id", uniqueIds);

  if (error) {
    logSupabaseError("resolveProjectNames", error);
    return new Map();
  }

  return new Map((data ?? []).map((project) => [project.id, project.name]));
}

/**
 * Best-effort, idempotent overdue-status refresh. Never throws — a failure
 * here should not block the page from loading with whatever status is
 * currently stored.
 */
async function refreshOverdueInvoices(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_overdue_invoices");
  if (error) {
    logSupabaseError("refreshOverdueInvoices", error);
  }
}

export async function getInvoicePage(
  organizationId: string,
  filters: InvoiceFilters,
): Promise<InvoicePageData> {
  await refreshOverdueInvoices();

  const supabase = await createClient();
  const from = (filters.page - 1) * INVOICES_PAGE_SIZE;
  const to = from + INVOICES_PAGE_SIZE - 1;
  let query = supabase
    .from("invoices")
    .select(INVOICE_LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.ilike("invoice_number", `%${search}%`);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    logSupabaseError("getInvoicePage", error);
    throw new Error("Unable to load invoices.");
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as InvoiceJoinRow[];
  const projectNames = await resolveProjectNames(
    rows.map((row) => row.project_id).filter((id): id is string => id !== null),
  );

  return {
    invoices: rows.map((invoice) => ({
      ...invoice,
      status: invoice.status as InvoiceStatus,
      clientName: clientDisplayName(invoice.clients),
      projectName: invoice.project_id
        ? (projectNames.get(invoice.project_id) ?? null)
        : null,
    })) as InvoiceListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / INVOICES_PAGE_SIZE)),
  };
}

export async function getInvoiceDetail(
  organizationId: string,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  await refreshOverdueInvoices();

  const supabase = await createClient();
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(INVOICE_LIST_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    logSupabaseError("getInvoiceDetail.invoice", invoiceError);
    throw new Error("Unable to load this invoice.");
  }

  if (!invoice) {
    return null;
  }

  const invoiceRow = invoice as unknown as InvoiceJoinRow;

  const [itemsResult, paymentsResult, projectNames] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id, invoice_id, description, quantity, unit_price, line_total, sort_order, created_at")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("payments")
      .select(
        "id, organization_id, client_id, invoice_id, amount, currency, payment_method, provider, provider_reference, status, paid_at, recorded_by, notes, metadata, idempotency_key, provider_event_id, created_at, updated_at",
      )
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false }),
    resolveProjectNames(invoiceRow.project_id ? [invoiceRow.project_id] : []),
  ]);

  if (itemsResult.error) {
    logSupabaseError("getInvoiceDetail.items", itemsResult.error);
    throw new Error("Unable to load invoice line items.");
  }

  if (paymentsResult.error) {
    logSupabaseError("getInvoiceDetail.payments", paymentsResult.error);
    throw new Error("Unable to load invoice payments.");
  }

  return {
    ...invoiceRow,
    status: invoiceRow.status as InvoiceStatus,
    clientName: clientDisplayName(invoiceRow.clients),
    projectName: invoiceRow.project_id
      ? (projectNames.get(invoiceRow.project_id) ?? null)
      : null,
    items: itemsResult.data ?? [],
    payments: paymentsResult.data ?? [],
  } as InvoiceDetail;
}

export async function getClientOptions(
  organizationId: string,
): Promise<ClientOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("business_name", { ascending: true })
    .limit(200);

  if (error) {
    logSupabaseError("getClientOptions", error);
    throw new Error("Unable to load clients.");
  }

  return (data ?? []).map((client) => ({
    id: client.id,
    label: client.business_name,
  }));
}

export interface ProjectOptionWithClient extends ProjectOption {
  clientId: string;
}

export async function getProjectOptions(
  organizationId: string,
): Promise<ProjectOptionWithClient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, client_id")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    logSupabaseError("getProjectOptions", error);
    throw new Error("Unable to load projects.");
  }

  return (data ?? []).map((project) => ({
    id: project.id,
    label: project.name,
    clientId: project.client_id,
  }));
}
