import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "@/features/clients/components/client-form";
import { memberCanManageClients } from "@/features/clients/permissions";
import { getClientDetail } from "@/features/clients/queries";
import { clientIdSchema } from "@/features/clients/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface EditClientPageProps {
  params: Promise<{ clientId: string }>;
}

export const metadata: Metadata = {
  title: "Edit client",
};

export default async function EditClientPage({
  params,
}: EditClientPageProps) {
  const { clientId } = await params;
  if (!clientIdSchema.safeParse(clientId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  if (!memberCanManageClients(member)) {
    notFound();
  }

  const client = await getClientDetail(member.organizationId, clientId);
  if (!client) {
    notFound();
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Clients"
        title={`Edit ${client.business_name}`}
        description="Update client contact details and status. Organization ownership and the source lead remain protected."
      />
      <ClientForm client={client} />
    </div>
  );
}
