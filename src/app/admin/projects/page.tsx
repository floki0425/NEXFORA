import { FolderKanban, Plus, Search } from "lucide-react";
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
  PROJECT_STATUSES,
  PROJECT_STATUS_BADGES,
  PROJECT_STATUS_LABELS,
} from "@/features/projects/constants";
import { formatProjectDate } from "@/features/projects/format";
import { memberCanManageProjects } from "@/features/projects/permissions";
import {
  getClientOptions,
  getProjectManagerOptions,
  getProjectPage,
} from "@/features/projects/queries";
import { projectFiltersSchema } from "@/features/projects/schemas";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Projects",
  description: "Track delivery for every active client engagement.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(
  filters: {
    query: string;
    status: string;
    clientId: string;
    projectManagerId: string;
  },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.clientId) params.set("clientId", filters.clientId);
  if (filters.projectManagerId)
    params.set("projectManagerId", filters.projectManagerId);
  params.set("page", String(page));
  return `/admin/projects?${params.toString()}`;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = projectFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    clientId: one(raw.clientId),
    projectManagerId: one(raw.projectManagerId),
    page: one(raw.page) || "1",
  });
  const [pageData, clients, managers] = await Promise.all([
    getProjectPage(member.organizationId, filters),
    getClientOptions(member.organizationId),
    getProjectManagerOptions(),
  ]);
  const canManage = memberCanManageProjects(member);
  const hasFilters = Boolean(
    filters.query ||
      filters.status ||
      filters.clientId ||
      filters.projectManagerId,
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Delivery"
        title="Projects"
        description="Track project delivery from kickoff through completion in one organization-scoped workspace."
        action={
          canManage ? (
            <Link href="/admin/projects/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden="true" />
              New project
            </Link>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <form
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_11rem_12rem_12rem_auto]"
        >
          <label className="relative">
            <span className="sr-only">Search projects</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search project name"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by client</span>
            <Select name="clientId" defaultValue={filters.clientId}>
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.businessName}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by project manager</span>
            <Select
              name="projectManagerId"
              defaultValue={filters.projectManagerId}
            >
              <option value="">All project managers</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.fullName}
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
            href="/admin/projects"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title={hasFilters ? "No matching projects" : "No projects yet"}
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : canManage
                  ? "Create a project from here or from a client's detail page."
                  : "Projects created for your organization will appear here."
            }
            action={
              canManage && !hasFilters ? (
                <Link href="/admin/projects/new" className={buttonStyles()}>
                  Create first project
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
                  Projects sorted by most recently updated
                </caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Project
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Client
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Target date
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.projects.map((project) => (
                    <tr key={project.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/projects/${project.id}`}
                          className="font-semibold text-foreground hover:text-accent"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {project.clientName}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={PROJECT_STATUS_BADGES[project.status]}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {project.target_date ?? "Not set"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {formatProjectDate(project.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {pageData.projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="block p-5 hover:bg-surface-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {project.name}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {project.clientName}
                      </p>
                    </div>
                    <Badge variant={PROJECT_STATUS_BADGES[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>{formatProjectDate(project.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <nav
            aria-label="Project list pagination"
            className="flex items-center justify-between gap-4"
          >
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} · {pageData.total}{" "}
              project{pageData.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              {pageData.page > 1 ? (
                <Link
                  href={pageHref(filters, pageData.page - 1)}
                  className={buttonStyles({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  Previous
                </Link>
              ) : null}
              {pageData.page < pageData.pageCount ? (
                <Link
                  href={pageHref(filters, pageData.page + 1)}
                  className={buttonStyles({
                    variant: "secondary",
                    size: "sm",
                  })}
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
