import type { InvoiceStatus, PaymentMethod } from "@/features/invoices/constants";

export interface PortalInvoiceListItem {
  id: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  currency: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PortalInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  sortOrder: number;
}

export interface PortalInvoicePayment {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  provider: "manual" | "paymongo";
  status: string;
  paidAt: string | null;
}

export interface PortalInvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  items: PortalInvoiceItem[];
  payments: PortalInvoicePayment[];
}

export interface PortalInvoiceActionResult {
  ok: boolean;
  message: string;
  checkoutUrl?: string;
}
