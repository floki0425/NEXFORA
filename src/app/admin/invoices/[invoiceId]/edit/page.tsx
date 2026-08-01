import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { InvoiceEditForm } from "@/features/invoices/components/invoice-edit-form";
import { LineItemsEditor } from "@/features/invoices/components/line-items-editor";
import {
  isInvoiceEditable,
  memberCanManageInvoices,
} from "@/features/invoices/permissions";
import { getInvoiceDetail } from "@/features/invoices/queries";
import { invoiceIdSchema } from "@/features/invoices/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface EditInvoicePageProps {
  params: Promise<{ invoiceId: string }>;
}

export const metadata: Metadata = {
  title: "Edit invoice",
};

export default async function EditInvoicePage({
  params,
}: EditInvoicePageProps) {
  const { invoiceId } = await params;
  if (!invoiceIdSchema.safeParse(invoiceId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  if (!memberCanManageInvoices(member)) {
    notFound();
  }

  const invoice = await getInvoiceDetail(member.organizationId, invoiceId);
  if (!invoice) {
    notFound();
  }

  const editable = isInvoiceEditable(invoice.status);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Finance"
        title={`Edit ${invoice.invoice_number ?? "draft invoice"}`}
        description={
          editable
            ? "Update invoice details and line items. The client and project remain protected."
            : "This invoice is no longer editable in its current status."
        }
      />
      {editable ? (
        <>
          <InvoiceEditForm invoice={invoice} />
          <LineItemsEditor
            invoiceId={invoice.id}
            items={invoice.items}
            subtotal={invoice.subtotal}
            discount={invoice.discount}
            tax={invoice.tax}
            total={invoice.total}
            currency={invoice.currency}
            editable
          />
        </>
      ) : null}
    </div>
  );
}
