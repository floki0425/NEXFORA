import { ArrowLeft, Eye, History, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResendProposalEmailButton } from "@/features/proposals/components/resend-proposal-email-button";
import { SendProposalButton } from "@/features/proposals/components/send-proposal-button";
import {
  PROPOSAL_STATUS_BADGES,
  PROPOSAL_STATUS_LABELS,
} from "@/features/proposals/constants";
import {
  formatMoney,
  formatProposalDate,
  formatProposalDay,
} from "@/features/proposals/format";
import {
  isProposalEditable,
  memberCanManageProposals,
} from "@/features/proposals/permissions";
import { getProposalDetail } from "@/features/proposals/queries";
import { proposalIdSchema } from "@/features/proposals/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface ProposalPageProps {
  params: Promise<{ proposalId: string }>;
}

export async function generateMetadata({
  params,
}: ProposalPageProps): Promise<Metadata> {
  const { proposalId } = await params;
  return {
    title: proposalIdSchema.safeParse(proposalId).success
      ? "Proposal details"
      : "Proposal not found",
  };
}

function DataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6 text-foreground">
        {children || "Not provided"}
      </dd>
    </div>
  );
}

export default async function ProposalDetailPage({
  params,
}: ProposalPageProps) {
  const { proposalId } = await params;
  if (!proposalIdSchema.safeParse(proposalId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const proposal = await getProposalDetail(member.organizationId, proposalId);
  if (!proposal) {
    notFound();
  }

  const canManage = memberCanManageProposals(member);
  const editable = isProposalEditable(proposal.status);
  const canSend = canManage && editable;
  const canResend = canManage && ["sent", "viewed", "changes_requested"].includes(proposal.status);

  return (
    <div className="space-y-7">
      <Link
        href="/admin/proposals"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to proposals
      </Link>

      <PageHeader
        eyebrow="Proposal"
        title={proposal.title}
        description={
          proposal.proposal_number
            ? `${proposal.proposal_number} · ${proposal.clientName ?? proposal.leadName ?? "Not linked"}`
            : (proposal.clientName ?? proposal.leadName ?? "Not linked")
        }
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/proposals/${proposal.id}/preview`}
                className={buttonStyles({ variant: "secondary" })}
              >
                <Eye className="size-4" aria-hidden="true" />
                Preview
              </Link>
              <Link
                href={`/admin/proposals/${proposal.id}/versions`}
                className={buttonStyles({ variant: "secondary" })}
              >
                <History className="size-4" aria-hidden="true" />
                Versions
              </Link>
              {editable ? (
                <Link
                  href={`/admin/proposals/${proposal.id}/edit`}
                  className={buttonStyles({ variant: "secondary" })}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Link>
              ) : null}
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Overview</CardTitle>
                <Badge variant={PROPOSAL_STATUS_BADGES[proposal.status]}>
                  {PROPOSAL_STATUS_LABELS[proposal.status]}
                </Badge>
              </div>
              <CardDescription>
                Core proposal details and current status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Lead / Client">
                  {proposal.clientName ?? proposal.leadName}
                </DataItem>
                <DataItem label="Valid until">
                  {formatProposalDay(proposal.valid_until)}
                </DataItem>
                <DataItem label="Sent">
                  {proposal.sent_at ? formatProposalDate(proposal.sent_at) : "Not sent"}
                </DataItem>
                <DataItem label="Viewed">
                  {proposal.viewed_at ? formatProposalDate(proposal.viewed_at) : "Not viewed"}
                </DataItem>
                <DataItem label="Created">
                  {formatProposalDate(proposal.created_at)}
                </DataItem>
                <DataItem label="Last updated">
                  {formatProposalDate(proposal.updated_at)}
                </DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="Overview">
                    <span className="whitespace-pre-wrap">{proposal.summary}</span>
                  </DataItem>
                </div>
                <div className="sm:col-span-2">
                  <DataItem label="Scope">
                    <span className="whitespace-pre-wrap">{proposal.scope}</span>
                  </DataItem>
                </div>
              </dl>
              {proposal.status === "changes_requested" && proposal.requested_changes_message ? (
                <div className="mt-6 rounded-md border border-warning/20 bg-warning-soft p-4">
                  <h3 className="text-sm font-semibold text-foreground">Requested changes</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">
                    {proposal.requested_changes_message}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                {editable
                  ? "Manage line items from the edit page."
                  : "Line items are locked while this proposal is not in draft."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proposal.items.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Proposal line items</caption>
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-semibold">Item</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Qty</th>
                        <th scope="col" className="py-2 pr-3 font-semibold">Unit price</th>
                        <th scope="col" className="py-2 font-semibold">Line total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {proposal.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3 pr-3 font-medium text-foreground">{item.name}</td>
                          <td className="py-3 pr-3 text-text-secondary">{item.quantity}</td>
                          <td className="py-3 pr-3 text-text-secondary">
                            {formatMoney(item.unit_price, proposal.currency)}
                          </td>
                          <td className="py-3 font-medium text-foreground">
                            {formatMoney(item.quantity * item.unit_price, proposal.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No line items yet.</p>
              )}
              <dl className="ml-auto mt-5 max-w-xs space-y-2 border-t border-border pt-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Subtotal</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(proposal.subtotal, proposal.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Discount</dt>
                  <dd className="font-medium text-foreground">
                    -{formatMoney(proposal.discount, proposal.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Tax</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(proposal.tax, proposal.currency)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base">
                  <dt className="font-semibold text-foreground">Total</dt>
                  <dd className="font-semibold text-foreground">
                    {formatMoney(proposal.total, proposal.currency)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          {canSend || canResend ? (
            <Card>
              <CardHeader>
                <CardTitle>Send to client</CardTitle>
                <CardDescription>
                  {canSend
                    ? "Sending assigns the official proposal number and creates a secure client link."
                    : "Resending issues a fresh secure link without creating a new version."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {canSend ? (
                  <SendProposalButton proposalId={proposal.id} />
                ) : (
                  <ResendProposalEmailButton proposalId={proposal.id} />
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
