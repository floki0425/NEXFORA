import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectCreateForm } from "@/features/projects/components/project-create-form";
import { memberCanManageProjects } from "@/features/projects/permissions";
import {
  getClientOptions,
  getProjectManagerOptions,
} from "@/features/projects/queries";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "New project",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  if (!memberCanManageProjects(member)) {
    notFound();
  }

  const raw = await searchParams;
  const requestedClientId = one(raw.clientId);

  const [clients, managers] = await Promise.all([
    getClientOptions(member.organizationId),
    getProjectManagerOptions(),
  ]);

  const defaultClientId = clients.some(
    (client) => client.id === requestedClientId,
  )
    ? requestedClientId
    : undefined;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Delivery"
        title="Create project"
        description="Set up a new client engagement. The organization is assigned securely on the server."
      />
      <ProjectCreateForm
        clients={clients}
        managers={managers}
        defaultClientId={defaultClientId}
      />
    </div>
  );
}
