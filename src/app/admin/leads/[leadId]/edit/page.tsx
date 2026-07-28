import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { LeadForm } from "@/features/leads/components/lead-form";
import { memberCanManageLeads } from "@/features/leads/permissions";
import { getLeadDetail, getMemberOptions } from "@/features/leads/queries";
import { leadIdSchema } from "@/features/leads/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface EditLeadPageProps {
  params: Promise<{ leadId: string }>;
}

export const metadata: Metadata = {
  title: "Edit lead",
};

export default async function EditLeadPage({ params }: EditLeadPageProps) {
  const { leadId } = await params;
  if (!leadIdSchema.safeParse(leadId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  if (!memberCanManageLeads(member)) {
    notFound();
  }

  const [lead, members] = await Promise.all([
    getLeadDetail(member.organizationId, leadId),
    getMemberOptions(),
  ]);
  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="CRM"
        title={`Edit ${lead.full_name}`}
        description="Update contact, scope, qualification, and assignment. Organization and conversion fields remain protected."
      />
      <LeadForm members={members} lead={lead} />
    </div>
  );
}
