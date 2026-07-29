import { FileText, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_BADGES,
  PROPOSAL_STATUS_LABELS,
} from "@/features/proposals/constants";
import { formatProposalDate } from "@/features/proposals/format";
import { memberCanManageProposals } from "@/features/proposals/permissions";
import { getProposalPage } from "@/features/proposals/queries";
import { proposalFiltersSchema } from "@/features/proposals/schemas";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Proposals",
  description: "Track sales proposals from draft through acceptance.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(
  filters: { query: string; status: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  params.set("page", String(page));
  return `/admin/proposals?${params.toString()}`;
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = proposalFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    page: one(raw.page) || "1",
  });
  const pageData = await getProposalPage(member.organizationId, filters);
  const canManage = memberCanManageProposals(member);
  const hasFilters = Boolean(filters.query || filters.status);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Sales"
        title="Proposals"
        description="Turn qualified leads into professional proposals, then track sending, viewing, and acceptance in one place."
        action={
          canManage ? (
            <Link href="/admin/proposals/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden="true" />
              New proposal
            </Link>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <form method="get" className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_auto]">
          <label className="relative">
            <span className="sr-only">Search proposals</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search proposal title"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {PROPOSAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROPOSAL_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonStyles({ variant: "secondary" })}>
            Apply
          </button>
        </form>
        {hasFilters ? (
          <Link
            href="/admin/proposals"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.proposals.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={hasFilters ? "No matching proposals" : "No proposals yet"}
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : canManage
                  ? "Create a proposal from a qualified lead to get started."
                  : "Proposals created for your organization will appear here."
            }
            action={
              canManage && !hasFilters ? (
                <Link href="/admin/proposals/new" className={buttonStyles()}>
                  Create first proposal
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Proposals sorted by most recently updated
                </caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Proposal</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Lead / Client</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.proposals.map((proposal) => (
                    <tr key={proposal.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/proposals/${proposal.id}`}
                          className="font-semibold text-foreground hover:text-accent"
                        >
                          {proposal.title}
                        </Link>
                        {proposal.proposal_number ? (
                          <p className="mt-1 text-text-muted">{proposal.proposal_number}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {proposal.clientName ?? proposal.leadName ?? "Not linked"}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={PROPOSAL_STATUS_BADGES[proposal.status]}>
                          {PROPOSAL_STATUS_LABELS[proposal.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {formatProposalDate(proposal.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {pageData.proposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  href={`/admin/proposals/${proposal.id}`}
                  className="block p-5 hover:bg-surface-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{proposal.title}</p>
                      <p className="mt-1 text-sm text-text-muted">
                        {proposal.clientName ?? proposal.leadName ?? "Not linked"}
                      </p>
                    </div>
                    <Badge variant={PROPOSAL_STATUS_BADGES[proposal.status]}>
                      {PROPOSAL_STATUS_LABELS[proposal.status]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>{formatProposalDate(proposal.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <nav aria-label="Proposal list pagination" className="flex items-center justify-between gap-4">
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} · {pageData.total}{" "}
              proposal{pageData.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              {pageData.page > 1 ? (
                <Link
                  href={pageHref(filters, pageData.page - 1)}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Previous
                </Link>
              ) : null}
              {pageData.page < pageData.pageCount ? (
                <Link
                  href={pageHref(filters, pageData.page + 1)}
                  className={buttonStyles({ variant: "secondary", size: "sm" })}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
