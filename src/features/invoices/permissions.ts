import type { InternalMember, InternalRole } from "@/lib/auth/types";

import {
  EDITABLE_INVOICE_STATUSES,
  INVOICE_MANAGER_ROLES,
  PAYABLE_INVOICE_STATUSES,
  VOIDABLE_INVOICE_STATUSES,
  type InvoiceStatus,
} from "./constants.ts";

export function canManageInvoices(role: InternalRole): boolean {
  return INVOICE_MANAGER_ROLES.some((allowedRole) => allowedRole === role);
}

export function memberCanManageInvoices(member: InternalMember): boolean {
  return canManageInvoices(member.role);
}

export function isInvoiceEditable(status: InvoiceStatus): boolean {
  return EDITABLE_INVOICE_STATUSES.includes(status);
}

export function isInvoicePayable(status: InvoiceStatus): boolean {
  return PAYABLE_INVOICE_STATUSES.includes(status);
}

export function isInvoiceVoidable(status: InvoiceStatus): boolean {
  return VOIDABLE_INVOICE_STATUSES.includes(status);
}
