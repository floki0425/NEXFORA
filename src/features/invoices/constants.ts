import type { BadgeVariant } from "@/components/ui/badge";

// Matches proposals' PROPOSAL_MANAGER_ROLES exactly: invoices are at least
// as sensitive as proposals (they carry official numbers and payment
// history), so creation/edit/send/void/payment-recording stay restricted to
// the same two roles. project_manager and team_member get read-only access
// via invoices_select_internal_members (any active internal member).
export const INVOICE_MANAGER_ROLES = ["super_admin", "admin"] as const;

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const EDITABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = ["draft"];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export const INVOICE_STATUS_BADGES: Record<InvoiceStatus, BadgeVariant> = {
  draft: "neutral",
  sent: "info",
  partial: "warning",
  paid: "success",
  overdue: "error",
  void: "neutral",
};

// Statuses record_manual_payment / start_paymongo_checkout accept a payment
// against. Kept here too so the UI can decide when to show payment actions
// without waiting on a failed server round trip.
export const PAYABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "sent",
  "partial",
  "overdue",
];

export const VOIDABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "draft",
  "sent",
  "partial",
  "overdue",
];

export const INVOICES_PAGE_SIZE = 20;

export const INVOICE_CURRENCY_DEFAULT = "PHP";

export const PAYMENT_METHODS = [
  "bank_transfer",
  "gcash",
  "card",
  "cash",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  gcash: "GCash",
  card: "Card",
  cash: "Cash",
  other: "Other",
};

export const PAYMENT_STATUS_BADGES: Record<string, BadgeVariant> = {
  pending: "info",
  processing: "info",
  paid: "success",
  failed: "error",
  refunded: "neutral",
  cancelled: "neutral",
};
