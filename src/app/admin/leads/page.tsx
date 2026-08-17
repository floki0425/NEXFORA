import { Plus, Search, UsersRound } from "lucide-react";
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
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_BADGES,
  LEAD_STATUS_LABELS,
} from "@/features/leads/constants";
import { formatBudget, formatLeadDate } from "@/features/leads/format";
import { memberCanManageLeads } from "@/features/leads/permissions";
import {
  getLeadPage,
  getMemberOptions,
} from "@/features/leads/queries";
import { leadFiltersSchema } from "@/features/leads/schemas";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Leads",
  description: "Review and manage project inquiries.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(
  filters: {
    query: string;
    status: string;
    source: string;
    assignedTo: string;
  },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
  params.set("page", String(page));
  return `/admin/leads?${params.toString()}`;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = leadFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    source: one(raw.source),
    assignedTo: one(raw.assignedTo),
    page: one(raw.page) || "1",
  });
  const [pageData, memberOptions] = await Promise.all([
    getLeadPage(member.organizationId, filters),
    getMemberOptions(),
  ]);
  const canManage = memberCanManageLeads(member);
  const hasFilters = Boolean(
    filters.query ||
      filters.status ||
      filters.source ||
      filters.assignedTo,
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Track project inquiries, ownership, and the next step from one workspace."
        action={
          canManage ? (
            <Link href="/admin/leads/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden="true" />
              New lead
            </Link>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_12rem_12rem_14rem_auto]">
          <label className="relative">
            <span className="sr-only">Search leads</span>
            <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted" aria-hidden="true" />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search name, business, or email"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>{LEAD_STATUS_LABELS[status]}</option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by source</span>
            <Select name="source" defaultValue={filters.source}>
              <option value="">All sources</option>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by assignee</span>
            <Select name="assignedTo" defaultValue={filters.assignedTo}>
              <option value="">All assignees</option>
              {memberOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.fullName}</option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonStyles({ variant: "secondary" })}>
            Apply
          </button>
        </form>
        {hasFilters ? (
          <Link href="/admin/leads" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.leads.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title={hasFilters ? "No matching leads" : "No leads yet"}
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : canManage
                  ? "Create a lead or share the project inquiry form to start the pipeline."
                  : "Project inquiries will appear here when they are received."
            }
            action={
              canManage && !hasFilters ? (
                <Link href="/admin/leads/new" className={buttonStyles()}>
                  Create first lead
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
                <caption className="sr-only">Leads sorted by most recently updated</caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Lead</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Project</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Source</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Assignee</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Submitted</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-4">
                        <Link href={`/admin/leads/${lead.id}`} className="font-semibold text-foreground hover:text-accent">
                          {lead.full_name}
                        </Link>
                        <p className="mt-1 text-text-muted">{lead.business_name ?? lead.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-text-secondary">{lead.service_interest}</p>
                        <p className="mt-1 text-text-muted">{formatBudget(lead.budget_min, lead.budget_max)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={LEAD_STATUS_BADGES[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">{LEAD_SOURCE_LABELS[lead.source]}</td>
                      <td className="px-5 py-4 text-text-secondary">{lead.assigneeName ?? "Unassigned"}</td>
                      <td className="px-5 py-4 text-text-secondary">{formatLeadDate(lead.created_at)}</td>
                      <td className="px-5 py-4 text-text-secondary">{formatLeadDate(lead.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {pageData.leads.map((lead) => (
                <Link key={lead.id} href={`/admin/leads/${lead.id}`} className="block p-5 hover:bg-surface-muted">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{lead.full_name}</p>
                      <p className="mt-1 text-sm text-text-muted">{lead.business_name ?? lead.email}</p>
                    </div>
                    <Badge variant={LEAD_STATUS_BADGES[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-text-secondary">
                    {lead.service_interest} · {formatBudget(lead.budget_min, lead.budget_max)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>{LEAD_SOURCE_LABELS[lead.source]}</span>
                    <span>{lead.assigneeName ?? "Unassigned"}</span>
                    <span>Submitted {formatLeadDate(lead.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <nav aria-label="Lead list pagination" className="flex items-center justify-between gap-4">
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} · {pageData.total} lead{pageData.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              {pageData.page > 1 ? (
                <Link href={pageHref(filters, pageData.page - 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  Previous
                </Link>
              ) : null}
              {pageData.page < pageData.pageCount ? (
                <Link href={pageHref(filters, pageData.page + 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
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
