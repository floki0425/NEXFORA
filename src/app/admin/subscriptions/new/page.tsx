import { BriefcaseBusiness } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubscriptionCreateForm } from "@/features/subscriptions/components/subscription-create-form";
import { memberCanManageSubscriptions } from "@/features/subscriptions/permissions";
import { getSubscriptionFormOptions } from "@/features/subscriptions/queries";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "New maintenance subscription",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  if (!memberCanManageSubscriptions(member)) {
    notFound();
  }

  const raw = await searchParams;
  const requestedClientId = one(raw.clientId);
  const { clients, projects } = await getSubscriptionFormOptions();
  const defaultClientId = clients.some(
    (client) => client.id === requestedClientId,
  )
    ? requestedClientId
    : undefined;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Post-launch"
        title="Create maintenance subscription"
        description="Assign a recurring maintenance plan to a client. Renewal tracking does not charge the client automatically."
      />

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title="No active clients"
            description="An active client must exist before a maintenance subscription can be created."
            action={
              <Link href="/admin/clients" className={buttonStyles()}>
                View clients
              </Link>
            }
          />
        </Card>
      ) : (
        <SubscriptionCreateForm
          clients={clients}
          projects={projects}
          defaultClientId={defaultClientId}
        />
      )}
    </div>
  );
}
