import { BriefcaseBusiness } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SupportTicketCreateForm } from "@/features/support/components/support-ticket-create-form";
import { canCreateInternalSupportTicket } from "@/features/support/permissions";
import {
  getSupportClientOptions,
  getSupportProjectOptions,
} from "@/features/support/queries";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "New support ticket",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function NewSupportTicketPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  if (!canCreateInternalSupportTicket(member)) {
    notFound();
  }

  const raw = await searchParams;
  const requestedClientId = one(raw.clientId);
  const [clients, projects] = await Promise.all([
    getSupportClientOptions(member.organizationId),
    getSupportProjectOptions(member.organizationId),
  ]);
  const defaultClientId = clients.some(
    (client) => client.id === requestedClientId,
  )
    ? requestedClientId
    : undefined;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Post-launch"
        title="Create support ticket"
        description="Record a client issue and begin a traceable support workflow."
      />

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title="No active clients"
            description="An active client must exist before a support ticket can be created."
            action={
              <Link href="/admin/clients" className={buttonStyles()}>
                View clients
              </Link>
            }
          />
        </Card>
      ) : (
        <SupportTicketCreateForm
          clients={clients}
          projects={projects}
          defaultClientId={defaultClientId}
        />
      )}
    </div>
  );
}
