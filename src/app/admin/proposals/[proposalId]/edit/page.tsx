import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { LineItemsEditor } from "@/features/proposals/components/line-items-editor";
import { ProposalEditForm } from "@/features/proposals/components/proposal-edit-form";
import {
  isProposalEditable,
  memberCanManageProposals,
} from "@/features/proposals/permissions";
import { getProposalDetail } from "@/features/proposals/queries";
import { proposalIdSchema } from "@/features/proposals/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface EditProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

export const metadata: Metadata = {
  title: "Edit proposal",
};

export default async function EditProposalPage({
  params,
}: EditProposalPageProps) {
  const { proposalId } = await params;
  if (!proposalIdSchema.safeParse(proposalId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  if (!memberCanManageProposals(member)) {
    notFound();
  }

  const proposal = await getProposalDetail(member.organizationId, proposalId);
  if (!proposal) {
    notFound();
  }

  const editable = isProposalEditable(proposal.status);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Sales"
        title={`Edit ${proposal.title}`}
        description={
          editable
            ? "Update proposal content and line items. Organization and lead ownership remain protected."
            : "This proposal is no longer editable in its current status."
        }
      />
      {editable ? (
        <>
          <ProposalEditForm proposal={proposal} />
          <LineItemsEditor
            proposalId={proposal.id}
            items={proposal.items}
            subtotal={proposal.subtotal}
            discount={proposal.discount}
            tax={proposal.tax}
            total={proposal.total}
            currency={proposal.currency}
            editable
          />
        </>
      ) : null}
    </div>
  );
}
