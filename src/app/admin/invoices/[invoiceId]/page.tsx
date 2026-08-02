import { ArrowLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RecordPaymentForm } from "@/features/invoices/components/record-payment-form";
import { ResendInvoiceEmailButton } from "@/features/invoices/components/resend-invoice-email-button";
import { SendInvoiceButton } from "@/features/invoices/components/send-invoice-button";
import { VoidInvoiceButton } from "@/features/invoices/components/void-invoice-button";
import {
  INVOICE_STATUS_BADGES,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/features/invoices/constants";
import {
  formatInvoiceDate,
  formatInvoiceDay,
  formatMoney,
} from "@/features/invoices/format";
import {
  isInvoiceEditable,
  isInvoicePayable,
  isInvoiceVoidable,
  memberCanManageInvoices,
} from "@/features/invoices/permissions";
import { getInvoiceDetail } from "@/features/invoices/queries";
import { invoiceIdSchema } from "@/features/invoices/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface InvoicePageProps {
  params: Promise<{ invoiceId: string }>;
}

export async function generateMetadata({
  params,
}: InvoicePageProps): Promise<Metadata> {
  const { invoiceId } = await params;
  return {
    title: invoiceIdSchema.safeParse(invoiceId).success
      ? "Invoice details"
      : "Invoice not found",
  };
}

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

export default async function InvoiceDetailPage({ params }: InvoicePageProps) {
  const { invoiceId } = await params;
  if (!invoiceIdSchema.safeParse(invoiceId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const invoice = await getInvoiceDetail(member.organizationId, invoiceId);
  if (!invoice) {
    notFound();
  }

  const canManage = memberCanManageInvoices(member);
  const editable = isInvoiceEditable(invoice.status);
  const canSend = canManage && editable;
  const canResend = canManage && !editable && invoice.status !== "void";
  const canVoid = canManage && isInvoiceVoidable(invoice.status);
  const canRecordPayment = canManage && isInvoicePayable(invoice.status);
  const paidPayments = invoice.payments.filter(
    (payment) => payment.status === "paid",
  );

  return (
    <div className="space-y-7">
      <Link
        href="/admin/invoices"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to invoices
      </Link>

      <PageHeader
        eyebrow="Invoice"
        title={invoice.invoice_number ?? "Draft invoice"}
        description={
          invoice.clientName
            ? `${invoice.clientName}${invoice.projectName ? ` · ${invoice.projectName}` : ""}`
            : "Not linked"
        }
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {editable ? (
                <Link
                  href={`/admin/invoices/${invoice.id}/edit`}
                  className={buttonStyles({ variant: "secondary" })}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Link>
              ) : null}
              {canVoid ? <VoidInvoiceButton invoiceId={invoice.id} /> : null}
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Overview</CardTitle>
                <Badge variant={INVOICE_STATUS_BADGES[invoice.status]}>
                  {INVOICE_STATUS_LABELS[invoice.status]}
                </Badge>
              </div>
              <CardDescription>
                Core invoice details and current status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Client">{invoice.clientName}</DataItem>
                <DataItem label="Project">{invoice.projectName}</DataItem>
                <DataItem label="Issue date">
                  {formatInvoiceDay(invoice.issue_date)}
                </DataItem>
                <DataItem label="Due date">
                  {formatInvoiceDay(invoice.due_date)}
                </DataItem>
                <DataItem label="Sent">
                  {invoice.sent_at ? formatInvoiceDate(invoice.sent_at) : "Not sent"}
                </DataItem>
                <DataItem label="Viewed">
                  {invoice.viewed_at ? formatInvoiceDate(invoice.viewed_at) : "Not viewed"}
                </DataItem>
                <DataItem label="Paid">
                  {invoice.paid_at ? formatInvoiceDate(invoice.paid_at) : "Not fully paid"}
                </DataItem>
                <DataItem label="Voided">
                  {invoice.voided_at ? formatInvoiceDate(invoice.voided_at) : "Not voided"}
                </DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="Internal notes">
                    <span className="whitespace-pre-wrap">{invoice.notes}</span>
                  </DataItem>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                {editable
                  ? "Manage line items from the edit page."
                  : "Line items are locked once the invoice has been sent."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoice.items.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Invoice line items</caption>
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Qty</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Unit price</th>
                        <th scope="col" className="py-2 font-semibold">Line total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3 pr-3 font-medium text-foreground">
                            {item.description}
                          </td>
                          <td className="py-3 pr-3 text-text-secondary">{item.quantity}</td>
                          <td className="py-3 pr-3 text-text-secondary">
                            {formatMoney(item.unit_price, invoice.currency)}
                          </td>
                          <td className="py-3 font-medium text-foreground">
                            {formatMoney(item.line_total, invoice.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No line items yet.</p>
              )}
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
                  <dt className="text-text-secondary">Amount paid</dt>
                  <dd className="font-medium text-success">
                    {formatMoney(invoice.amount_paid, invoice.currency)}
                  </dd>
                </div>
                <div className="flex justify-between text-base">
                  <dt className="font-semibold text-foreground">Balance due</dt>
                  <dd className="font-semibold text-foreground">
                    {formatMoney(invoice.balance_due, invoice.currency)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
              <CardDescription>Confirmed payments only.</CardDescription>
            </CardHeader>
            <CardContent>
              {paidPayments.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Payment history</caption>
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-semibold">Amount</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Method</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Provider</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Reference</th>
                        <th scope="col" className="py-2 font-semibold">Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paidPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="py-3 pr-3 font-medium text-foreground">
                            {formatMoney(payment.amount, payment.currency)}
                          </td>
                          <td className="py-3 pr-3 text-text-secondary">
                            {payment.payment_method
                              ? PAYMENT_METHOD_LABELS[payment.payment_method as PaymentMethod]
                              : "—"}
                          </td>
                          <td className="py-3 pr-3 text-text-secondary capitalize">
                            {payment.provider}
                          </td>
                          <td className="py-3 pr-3 text-text-secondary">
                            {payment.provider_reference ?? "—"}
                          </td>
                          <td className="py-3 text-text-secondary">
                            {payment.paid_at ? formatInvoiceDate(payment.paid_at) : "—"}
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

        <aside className="space-y-6">
          {canSend || canResend ? (
            <Card>
              <CardHeader>
                <CardTitle>Send to client</CardTitle>
                <CardDescription>
                  {canSend
                    ? "Sending assigns the official invoice number and emails the client."
                    : "Resending emails the client a fresh link without changing the invoice."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {canSend ? (
                  <SendInvoiceButton invoiceId={invoice.id} />
                ) : (
                  <ResendInvoiceEmailButton invoiceId={invoice.id} />
                )}
              </CardContent>
            </Card>
          ) : null}

          {canRecordPayment ? (
            <RecordPaymentForm
              invoiceId={invoice.id}
              balanceDue={invoice.balance_due ?? 0}
              currency={invoice.currency}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
