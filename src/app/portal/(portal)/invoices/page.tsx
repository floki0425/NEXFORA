import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PortalInvoiceList } from "@/features/portal/invoices/components/portal-invoice-list";
import { getPortalInvoices } from "@/features/portal/invoices/queries";
import { requirePortalMember } from "@/lib/auth/portal";

export const metadata: Metadata = {
  title: "Invoices",
};

export default async function PortalInvoicesPage() {
  await requirePortalMember();
  const invoices = await getPortalInvoices();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Invoices"
        description="Review and pay invoices sent to you by Nexfora."
      />

      <Card>
        <CardContent>
          <PortalInvoiceList invoices={invoices} />
        </CardContent>
      </Card>
    </div>
  );
}
