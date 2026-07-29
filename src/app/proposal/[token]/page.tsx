import type { Metadata } from "next";

import { ErrorState } from "@/components/ui/error-state";
import { ProposalClientActions } from "@/features/proposals/components/proposal-client-actions";
import { ProposalDocument } from "@/features/proposals/components/proposal-document";
import { viewProposalByTokenAction } from "@/features/proposals/client-actions";

interface SecureProposalPageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Your Nexfora proposal",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function SecureProposalPage({
  params,
}: SecureProposalPageProps) {
  const { token } = await params;
  const proposal = await viewProposalByTokenAction(token);

  if (!proposal) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <ErrorState
          title="This proposal link is invalid or has expired"
          description="Please contact Nexfora if you believe this is a mistake and we will send you a new link."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:py-16">
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
        }}
      />
      <ProposalClientActions token={token} status={proposal.status} />
    </div>
  );
}
