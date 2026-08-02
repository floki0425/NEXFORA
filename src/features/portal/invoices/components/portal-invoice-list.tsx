import { Receipt } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  INVOICE_STATUS_BADGES,
  INVOICE_STATUS_LABELS,
} from "@/features/invoices/constants";
import { formatInvoiceDay, formatMoney } from "@/features/invoices/format";

import type { PortalInvoiceListItem } from "../types";

interface PortalInvoiceListProps {
  invoices: PortalInvoiceListItem[];
}

export function PortalInvoiceList({ invoices }: PortalInvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No invoices yet"
        description="Invoices sent to you by Nexfora will appear here."
      />
    );
  }

  return (
    <div className="divide-y divide-border border-t border-border">
      {invoices.map((invoice) => (
        <Link
          key={invoice.id}
          href={`/portal/invoices/${invoice.id}`}
          data-testid="portal-invoice-row"
          data-invoice-number={invoice.invoiceNumber ?? ""}
          className="flex flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:bg-surface-muted/60"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">
              {invoice.invoiceNumber ?? "Invoice"}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Due {formatInvoiceDay(invoice.dueDate)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-foreground">
              {formatMoney(invoice.balanceDue, invoice.currency)} due
            </p>
            <Badge
              data-testid="invoice-status-badge"
              variant={INVOICE_STATUS_BADGES[invoice.status]}
            >
              {INVOICE_STATUS_LABELS[invoice.status]}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}
