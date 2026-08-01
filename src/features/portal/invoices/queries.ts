import "server-only";

import type { InvoiceStatus, PaymentMethod } from "@/features/invoices/constants";
import { createClient } from "@/lib/supabase/server";

import type {
  PortalInvoiceDetail,
  PortalInvoiceItem,
  PortalInvoiceListItem,
  PortalInvoicePayment,
} from "./types";

interface ClientInvoiceRow {
  id: string;
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
  paid_at: string | null;
  created_at: string;
}

interface ClientInvoiceDetailRow extends ClientInvoiceRow {
  viewed_at: string | null;
  items: {
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    sort_order: number;
  }[];
  payments: {
    id: string;
    amount: number;
    currency: string;
    payment_method: string | null;
    provider: string;
    status: string;
    paid_at: string | null;
  }[];
}

function mapInvoiceRow(row: ClientInvoiceRow): PortalInvoiceListItem {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status as InvoiceStatus,
    currency: row.currency,
    total: row.total,
    amountPaid: row.amount_paid,
    balanceDue: row.balance_due,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    sentAt: row.sent_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

/**
 * Reads exclusively through get_client_invoices() — a SECURITY DEFINER
 * function that resolves the caller's active client membership internally.
 * There is deliberately no client-facing RLS policy on public.invoices
 * itself, mirroring Phase 7/8's design: a policy would also let a client
 * user query the base table directly and see internal-only columns like
 * organization_id, notes, and created_by.
 */
export async function getPortalInvoices(): Promise<PortalInvoiceListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_invoices");

  if (error) {
    throw new Error("Unable to load your invoices.");
  }

  return ((data ?? []) as unknown as ClientInvoiceRow[]).map(mapInvoiceRow);
}

/**
 * Reads through get_client_invoice_detail(), which returns null uniformly
 * for "no such invoice", "invoice belongs to another client", and "invoice
 * is still a draft" — a modified invoice id can never be used to probe
 * another client's data or see a not-yet-sent draft.
 */
export async function getPortalInvoiceDetail(
  invoiceId: string,
): Promise<PortalInvoiceDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_invoice_detail", {
    target_invoice_id: invoiceId,
  });

  if (error || !data) {
    return null;
  }

  const row = data as unknown as ClientInvoiceDetailRow;

  const items: PortalInvoiceItem[] = (row.items ?? [])
    .map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
      sortOrder: item.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const payments: PortalInvoicePayment[] = (row.payments ?? []).map(
    (payment) => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.payment_method as PaymentMethod | null,
      provider: payment.provider as "manual" | "paymongo",
      status: payment.status,
      paidAt: payment.paid_at,
    }),
  );

  return {
    ...mapInvoiceRow(row),
    subtotal: row.subtotal,
    discount: row.discount,
    tax: row.tax,
    viewedAt: row.viewed_at,
    items,
    payments,
  };
}
