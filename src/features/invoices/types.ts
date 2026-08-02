import type { Database } from "@/types/database";

import type { InvoiceStatus } from "./constants";

export type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
export type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];

export type InvoiceItemRow =
  Database["public"]["Tables"]["invoice_items"]["Row"];
export type InvoiceItemInsert =
  Database["public"]["Tables"]["invoice_items"]["Insert"];
export type InvoiceItemUpdate =
  Database["public"]["Tables"]["invoice_items"]["Update"];

export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export interface InvoiceListItem extends Omit<InvoiceRow, "status"> {
  status: InvoiceStatus;
  clientName: string | null;
  projectName: string | null;
}

export interface InvoiceDetail extends Omit<InvoiceRow, "status"> {
  status: InvoiceStatus;
  clientName: string | null;
  projectName: string | null;
  items: InvoiceItemRow[];
  payments: PaymentRow[];
}

export interface InvoiceFilters {
  query: string;
  status: InvoiceStatus | "";
  page: number;
}

export interface InvoicePageData {
  invoices: InvoiceListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface InvoiceActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
  invoiceId?: string;
}

export interface ClientOption {
  id: string;
  label: string;
}

export interface ProjectOption {
  id: string;
  label: string;
}
