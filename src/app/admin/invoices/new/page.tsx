import { BriefcaseBusiness } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceCreateForm } from "@/features/invoices/components/invoice-create-form";
import { memberCanManageInvoices } from "@/features/invoices/permissions";
import { getClientOptions, getProjectOptions } from "@/features/invoices/queries";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "New invoice",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  if (!memberCanManageInvoices(member)) {
    notFound();
  }

  const raw = await searchParams;
  const requestedClientId = one(raw.clientId);
  const [clients, projects] = await Promise.all([
    getClientOptions(member.organizationId),
    getProjectOptions(member.organizationId),
  ]);
  const defaultClientId = clients.some((client) => client.id === requestedClientId)
    ? requestedClientId
    : undefined;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Finance"
        title="Create invoice"
        description="Start an invoice draft for a client. The organization is assigned securely on the server."
      />
      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title="No active clients"
            description="A client must exist before an invoice can be created."
            action={
              <Link href="/admin/clients" className={buttonStyles()}>
                View clients
              </Link>
            }
          />
        </Card>
      ) : (
        <InvoiceCreateForm
          clients={clients}
          projects={projects}
          defaultClientId={defaultClientId}
        />
      )}
    </div>
  );
}
