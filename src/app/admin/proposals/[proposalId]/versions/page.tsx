import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatProposalDate } from "@/features/proposals/format";
import { getProposalDetail } from "@/features/proposals/queries";
import { proposalIdSchema } from "@/features/proposals/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface VersionsPageProps {
  params: Promise<{ proposalId: string }>;
}

export const metadata: Metadata = {
  title: "Proposal versions",
};

interface VersionSnapshot {
  title?: string;
  total?: number;
  currency?: string;
  proposal_number?: string;
}

export default async function ProposalVersionsPage({
  params,
}: VersionsPageProps) {
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
    <div className="space-y-7">
      <Link
        href={`/admin/proposals/${proposal.id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to proposal
      </Link>

      <PageHeader
        eyebrow="Proposal"
        title={`Version history: ${proposal.title}`}
        description="Every sent version is an immutable snapshot. Historical and accepted versions can never be overwritten."
      />

      {proposal.versions.length === 0 ? (
        <Card>
          <EmptyState
            title="No versions yet"
            description="A version snapshot is created automatically the first time this proposal is sent."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {proposal.versions.map((version) => {
            const snapshot = version.snapshot as VersionSnapshot;
            return (
              <Card key={version.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>Version {version.version_number}</CardTitle>
                    <span className="text-xs text-text-muted">
                      {formatProposalDate(version.created_at)}
                    </span>
                  </div>
                  <CardDescription>
                    {snapshot.proposal_number ?? "No number recorded"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-secondary">
                    {snapshot.title ?? proposal.title} —{" "}
                    {typeof snapshot.total === "number"
                      ? new Intl.NumberFormat("en-PH", {
                          style: "currency",
                          currency: snapshot.currency ?? proposal.currency,
                        }).format(snapshot.total)
                      : "Total unavailable"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
