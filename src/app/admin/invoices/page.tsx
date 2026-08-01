import { FileText, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_BADGES,
  INVOICE_STATUS_LABELS,
} from "@/features/invoices/constants";
import { formatInvoiceDay, formatMoney } from "@/features/invoices/format";
import { memberCanManageInvoices } from "@/features/invoices/permissions";
import { getInvoicePage } from "@/features/invoices/queries";
import { invoiceFiltersSchema } from "@/features/invoices/schemas";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Invoices",
  description: "Track invoices from draft through payment.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(
  filters: { query: string; status: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  params.set("page", String(page));
  return `/admin/invoices?${params.toString()}`;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = invoiceFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    page: one(raw.page) || "1",
  });
  const pageData = await getInvoicePage(member.organizationId, filters);
  const canManage = memberCanManageInvoices(member);
  const hasFilters = Boolean(filters.query || filters.status);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        description="Create, send, and track invoices and payments for every client."
        action={
          canManage ? (
            <Link href="/admin/invoices/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden="true" />
              New invoice
            </Link>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <form method="get" className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_auto]">
          <label className="relative">
            <span className="sr-only">Search invoices</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search invoice number"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {INVOICE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonStyles({ variant: "secondary" })}>
            Apply
          </button>
        </form>
        {hasFilters ? (
          <Link
            href="/admin/invoices"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.invoices.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={hasFilters ? "No matching invoices" : "No invoices yet"}
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : canManage
                  ? "Create an invoice for a client to get started."
                  : "Invoices created for your organization will appear here."
            }
            action={
              canManage && !hasFilters ? (
                <Link href="/admin/invoices/new" className={buttonStyles()}>
                  Create first invoice
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Invoices sorted by most recently updated
                </caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Invoice</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Client / Project</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Due</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      data-testid="invoice-row"
                      data-invoice-number={invoice.invoice_number ?? ""}
                      className="hover:bg-surface-muted/60"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/invoices/${invoice.id}`}
                          className="font-semibold text-foreground hover:text-accent"
                        >
                          {invoice.invoice_number ?? "Draft"}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {invoice.clientName ?? "Not linked"}
                        {invoice.projectName ? ` · ${invoice.projectName}` : ""}
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          data-testid="invoice-status-badge"
                          variant={INVOICE_STATUS_BADGES[invoice.status]}
                        >
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {formatInvoiceDay(invoice.due_date)}
                      </td>
                      <td className="px-5 py-4 font-medium text-foreground">
                        {formatMoney(invoice.balance_due, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {pageData.invoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/admin/invoices/${invoice.id}`}
                  className="block p-5 hover:bg-surface-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {invoice.invoice_number ?? "Draft"}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {invoice.clientName ?? "Not linked"}
                        {invoice.projectName ? ` · ${invoice.projectName}` : ""}
                      </p>
                    </div>
                    <Badge variant={INVOICE_STATUS_BADGES[invoice.status]}>
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>Due {formatInvoiceDay(invoice.due_date)}</span>
                    <span>{formatMoney(invoice.balance_due, invoice.currency)} due</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <nav aria-label="Invoice list pagination" className="flex items-center justify-between gap-4">
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} · {pageData.total}{" "}
              invoice{pageData.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              {pageData.page > 1 ? (
                <Link
                  href={pageHref(filters, pageData.page - 1)}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Previous
                </Link>
              ) : null}
              {pageData.page < pageData.pageCount ? (
                <Link
                  href={pageHref(filters, pageData.page + 1)}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
