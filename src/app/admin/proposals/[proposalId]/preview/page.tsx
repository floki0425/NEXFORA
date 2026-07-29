import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProposalDocument } from "@/features/proposals/components/proposal-document";
import { getProposalDetail } from "@/features/proposals/queries";
import { proposalIdSchema } from "@/features/proposals/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface PreviewProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

export const metadata: Metadata = {
  title: "Proposal preview",
};

export default async function PreviewProposalPage({
  params,
}: PreviewProposalPageProps) {
  const { proposalId } = await params;
  if (!proposalIdSchema.safeParse(proposalId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const proposal = await getProposalDetail(member.organizationId, proposalId);
  if (!proposal) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/admin/proposals/${proposal.id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to proposal
      </Link>
      <p className="text-sm text-text-muted">
        This is exactly what the client will see. Previewing does not mark the
        proposal as viewed.
      </p>
      <ProposalDocument
        proposal={{
          proposalNumber: proposal.proposal_number,
          title: proposal.title,
          summary: proposal.summary,
          scope: proposal.scope,
          deliverables: proposal.deliverables,
          timelineText: proposal.timeline_text,
          paymentTermsText: proposal.payment_terms_text,
          termsText: proposal.terms_text,
          currency: proposal.currency,
          subtotal: proposal.subtotal,
          discount: proposal.discount,
          tax: proposal.tax,
          total: proposal.total,
          validUntil: proposal.valid_until,
          status: proposal.status,
          items: proposal.items,
          recipientLabel: proposal.clientName ?? proposal.leadName,
        }}
      />
    </div>
  );
}
