import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INVOICE_STATUS_BADGES,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/features/invoices/constants";
import {
  formatInvoiceDay,
  formatMoney,
} from "@/features/invoices/format";
import { isInvoicePayable } from "@/features/invoices/permissions";
import { PayWithPaymongoButton } from "@/features/portal/invoices/components/pay-with-paymongo-button";
import { getPortalInvoiceDetail } from "@/features/portal/invoices/queries";
import { portalInvoiceIdSchema } from "@/features/portal/invoices/schemas";
import { requirePortalMember } from "@/lib/auth/portal";

interface PortalInvoicePageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "Invoice details",
};

function DataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6 text-foreground">
        {children || "Not provided"}
      </dd>
    </div>
  );
}

export default async function PortalInvoiceDetailPage({
  params,
  searchParams,
}: PortalInvoicePageProps) {
  const { invoiceId } = await params;
  if (!portalInvoiceIdSchema.safeParse(invoiceId).success) {
    notFound();
  }

  const member = await requirePortalMember();
  const invoice = await getPortalInvoiceDetail(invoiceId);
  if (!invoice) {
    notFound();
  }

  const raw = await searchParams;
  const paymentParam = Array.isArray(raw.payment) ? raw.payment[0] : raw.payment;
  const canPay =
    (member.role === "owner" || member.role === "manager") &&
    isInvoicePayable(invoice.status);

  return (
    <div className="space-y-8">
      <Link
        href="/portal/invoices"
        className={buttonStyles({ variant: "ghost", size: "sm" })}
      >
        ← Back to invoices
      </Link>

      <PageHeader
        title={invoice.invoiceNumber ?? "Invoice"}
        description="Your invoice details and payment history."
      />

      {paymentParam === "success" ? (
        <p
          role="status"
          className="rounded-md border border-info/20 bg-info-soft px-4 py-3 text-sm text-info"
        >
          Thanks! We are confirming your payment now — this page will update
          automatically once it is verified. This can take a few minutes.
        </p>
      ) : null}
      {paymentParam === "cancelled" ? (
        <p
          role="status"
          className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm text-text-secondary"
        >
          Checkout was cancelled. No payment was made.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Overview</CardTitle>
                <Badge variant={INVOICE_STATUS_BADGES[invoice.status]}>
                  {INVOICE_STATUS_LABELS[invoice.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Issue date">
                  {formatInvoiceDay(invoice.issueDate)}
                </DataItem>
                <DataItem label="Due date">
                  {formatInvoiceDay(invoice.dueDate)}
                </DataItem>
              </dl>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Invoice line items</caption>
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Qty</th>
                      <th scope="col" className="py-2 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoice.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 pr-3 font-medium text-foreground">
                          {item.description}
                        </td>
                        <td className="py-3 pr-3 text-text-secondary">{item.quantity}</td>
                        <td className="py-3 font-medium text-foreground">
                          {formatMoney(item.lineTotal, invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="ml-auto mt-5 max-w-xs space-y-2 border-t border-border pt-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Subtotal</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(invoice.subtotal, invoice.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Discount</dt>
                  <dd className="font-medium text-foreground">
                    -{formatMoney(invoice.discount, invoice.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Tax</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(invoice.tax, invoice.currency)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base">
                  <dt className="font-semibold text-foreground">Total</dt>
                  <dd className="font-semibold text-foreground">
                    {formatMoney(invoice.total, invoice.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Paid so far</dt>
                  <dd className="font-medium text-success">
                    {formatMoney(invoice.amountPaid, invoice.currency)}
                  </dd>
                </div>
                <div className="flex justify-between text-base">
                  <dt className="font-semibold text-foreground">Balance due</dt>
                  <dd className="font-semibold text-foreground">
                    {formatMoney(invoice.balanceDue, invoice.currency)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.payments.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Payment history</caption>
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-semibold">Amount</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Method</th>
                        <th scope="col" className="py-2 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="py-3 pr-3 font-medium text-foreground">
                            {formatMoney(payment.amount, payment.currency)}
                          </td>
                          <td className="py-3 pr-3 text-text-secondary">
                            {payment.paymentMethod
                              ? PAYMENT_METHOD_LABELS[payment.paymentMethod as PaymentMethod]
                              : "Online payment"}
                          </td>
                          <td className="py-3 text-text-secondary">
                            {payment.paidAt ? formatInvoiceDay(payment.paidAt.slice(0, 10)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No payments recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {canPay ? (
          <aside>
            <Card>
              <CardHeader>
                <CardTitle>Pay this invoice</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-text-secondary">
                  You will be redirected to a secure PayMongo checkout page.
                </p>
                <PayWithPaymongoButton invoiceId={invoice.id} />
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
