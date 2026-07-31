import { ListChecks, Search } from "lucide-react";
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
  REVISION_PRIORITIES,
  REVISION_PRIORITY_BADGES,
  REVISION_PRIORITY_LABELS,
  REVISION_STATUSES,
  REVISION_STATUS_BADGES,
  REVISION_STATUS_LABELS,
} from "@/features/revisions/constants";
import { formatRevisionDate } from "@/features/revisions/format";
import {
  getAssigneeOptions,
  getProjectOptions,
  getRevisionPage,
} from "@/features/revisions/queries";
import { revisionFiltersSchema } from "@/features/revisions/schemas";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Revisions",
  description: "Review and manage client revision requests.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(
  filters: {
    query: string;
    status: string;
    priority: string;
    projectId: string;
    assignedTo: string;
  },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
  params.set("page", String(page));
  return `/admin/revisions?${params.toString()}`;
}

export default async function RevisionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = revisionFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    priority: one(raw.priority),
    projectId: one(raw.projectId),
    assignedTo: one(raw.assignedTo),
    page: one(raw.page) || "1",
  });

  const [pageData, projectOptions, assigneeOptions] = await Promise.all([
    getRevisionPage(member.organizationId, filters),
    getProjectOptions(member.organizationId),
    getAssigneeOptions(member.organizationId),
  ]);

  const hasFilters = Boolean(
    filters.query ||
      filters.status ||
      filters.priority ||
      filters.projectId ||
      filters.assignedTo,
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Delivery"
        title="Revisions"
        description="Client-submitted revision requests across every project in your organization."
      />

      <Card className="p-4 sm:p-5">
        <form
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_12rem_12rem_auto]"
        >
          <label className="relative">
            <span className="sr-only">Search revisions</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search title"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {REVISION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {REVISION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by priority</span>
            <Select name="priority" defaultValue={filters.priority}>
              <option value="">All priorities</option>
              {REVISION_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {REVISION_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by project</span>
            <Select name="projectId" defaultValue={filters.projectId}>
              <option value="">All projects</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by assignee</span>
            <Select name="assignedTo" defaultValue={filters.assignedTo}>
              <option value="">All assignees</option>
              {assigneeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.fullName}
                </option>
              ))}
            </Select>
          </label>
          <button
            type="submit"
            className={buttonStyles({ variant: "secondary" })}
          >
            Apply
          </button>
        </form>
        {hasFilters ? (
          <Link
            href="/admin/revisions"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.revisions.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={hasFilters ? "No matching revisions" : "No revisions yet"}
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : "Client-submitted revision requests will appear here."
            }
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Revisions sorted by most recently updated
                </caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Revision
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Project / Client
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Priority
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Assignee
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.revisions.map((revision) => (
                    <tr key={revision.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/revisions/${revision.id}`}
                          className="font-semibold text-foreground hover:text-accent"
                        >
                          {revision.title}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {revision.projectName}
                        <p className="text-xs text-text-muted">
                          {revision.clientName}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={REVISION_PRIORITY_BADGES[revision.priority]}>
                          {REVISION_PRIORITY_LABELS[revision.priority]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={REVISION_STATUS_BADGES[revision.status]}>
                          {REVISION_STATUS_LABELS[revision.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {revision.assigneeName ?? "Unassigned"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {formatRevisionDate(revision.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {pageData.revisions.map((revision) => (
                <Link
                  key={revision.id}
                  href={`/admin/revisions/${revision.id}`}
                  className="block p-5 hover:bg-surface-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {revision.title}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {revision.projectName} · {revision.clientName}
                      </p>
                    </div>
                    <Badge variant={REVISION_STATUS_BADGES[revision.status]}>
                      {REVISION_STATUS_LABELS[revision.status]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <Badge variant={REVISION_PRIORITY_BADGES[revision.priority]}>
                      {REVISION_PRIORITY_LABELS[revision.priority]}
                    </Badge>
                    <span>{revision.assigneeName ?? "Unassigned"}</span>
                    <span>{formatRevisionDate(revision.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <nav
            aria-label="Revision list pagination"
            className="flex items-center justify-between gap-4"
          >
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} · {pageData.total}{" "}
              revision{pageData.total === 1 ? "" : "s"}
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
