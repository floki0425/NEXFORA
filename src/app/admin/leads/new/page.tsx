import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { LeadForm } from "@/features/leads/components/lead-form";
import { memberCanManageLeads } from "@/features/leads/permissions";
import { getMemberOptions } from "@/features/leads/queries";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "New lead",
};

export default async function NewLeadPage() {
  const member = await requireInternalMember();
  if (!memberCanManageLeads(member)) {
    notFound();
  }

  const members = await getMemberOptions();

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="CRM"
        title="Create lead"
        description="Add a qualified inquiry to the Nexfora pipeline. The organization and initial status are assigned securely on the server."
      />
      <LeadForm members={members} />
    </div>
  );
}
