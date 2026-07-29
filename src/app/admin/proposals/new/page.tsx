import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProposalCreateForm } from "@/features/proposals/components/proposal-create-form";
import { memberCanManageProposals } from "@/features/proposals/permissions";
import { getEligibleLeadOptions } from "@/features/proposals/queries";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "New proposal",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  if (!memberCanManageProposals(member)) {
    notFound();
  }

  const raw = await searchParams;
  const requestedLeadId = one(raw.leadId);
  const leads = await getEligibleLeadOptions(member.organizationId);
  const defaultLeadId = leads.some((lead) => lead.id === requestedLeadId)
    ? requestedLeadId
    : undefined;
  const staleRequestedLead = Boolean(requestedLeadId) && !defaultLeadId;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Sales"
        title="Create proposal"
        description="Start a proposal draft from a qualified lead. The organization is assigned securely on the server."
      />
      {staleRequestedLead ? (
        <p
          role="alert"
          className="rounded-md border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          The lead you came from is no longer eligible for a new proposal —
          it may not be qualified, may belong to a different organization, or
          may already have an active proposal. Choose another lead below.
        </p>
      ) : null}
      {leads.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title="No eligible qualified leads"
            description="A lead must be marked Qualified, and must not already have an active proposal, before a new proposal can be started."
            action={
              <Link href="/admin/leads?status=qualified" className={buttonStyles()}>
                View qualified leads
              </Link>
            }
          />
        </Card>
      ) : (
        <ProposalCreateForm leads={leads} defaultLeadId={defaultLeadId} />
      )}
    </div>
  );
}
