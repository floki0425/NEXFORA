import { LifeBuoy, Plus, Search } from "lucide-react";
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
  SUPPORT_TICKET_ADMIN_STATUS_LABELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_BADGES,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_STATUS_BADGES,
} from "@/features/support/constants";
import { formatSupportDate } from "@/features/support/format";
import { canCreateInternalSupportTicket } from "@/features/support/permissions";
import {
  getSupportAssigneeOptions,
  getSupportTicketPage,
} from "@/features/support/queries";
import { supportTicketFiltersSchema } from "@/features/support/schemas";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Support",
  description: "Manage client support tickets and resolution workflows.",
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
    assignedTo: string;
  },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
  params.set("page", String(page));
  return `/admin/support?${params.toString()}`;
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = supportTicketFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    priority: one(raw.priority),
    assignedTo: one(raw.assignedTo),
    page: one(raw.page) || "1",
  });

  const [pageData, assignees] = await Promise.all([
    getSupportTicketPage(member.organizationId, filters),
    getSupportAssigneeOptions(member.organizationId),
  ]);
  const canCreate = canCreateInternalSupportTicket(member);
  const hasFilters = Boolean(
    filters.query || filters.status || filters.priority || filters.assignedTo,
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Post-launch"
        title="Support"
        description="Track client issues from first report through verified resolution."
        action={
          canCreate ? (
            <Link href="/admin/support/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden="true" />
              New ticket
            </Link>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <form
          method="get"
          className="grid gap-3 lg:grid-cols-[minmax(13rem,1fr)_11rem_10rem_12rem_auto]"
        >
          <label className="relative">
            <span className="sr-only">Search support tickets</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search number or title"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {SUPPORT_TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SUPPORT_TICKET_ADMIN_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by priority</span>
            <Select name="priority" defaultValue={filters.priority}>
              <option value="">All priorities</option>
              {SUPPORT_TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {SUPPORT_TICKET_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by assignee</span>
            <Select name="assignedTo" defaultValue={filters.assignedTo}>
              <option value="">All assignees</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.fullName}
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
            href="/admin/support"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.tickets.length === 0 ? (
        <Card>
          <EmptyState
            icon={LifeBuoy}
            title={hasFilters ? "No matching tickets" : "No support tickets yet"}
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : canCreate
                  ? "Create a ticket for a client, or wait for a portal request."
                  : "Client support requests will appear here."
            }
            action={
              canCreate && !hasFilters ? (
                <Link href="/admin/support/new" className={buttonStyles()}>
                  Create first ticket
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
                  Support tickets sorted by most recently updated
                </caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Ticket
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Client / Project
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
                  {pageData.tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/support/${ticket.id}`}
                          className="font-semibold text-foreground hover:text-accent"
                        >
                          {ticket.ticketNumber}
                        </Link>
                        <p className="mt-1 max-w-xs truncate text-xs text-text-muted">
                          {ticket.title}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {ticket.clientName}
                        <p className="text-xs text-text-muted">
                          {ticket.projectName ?? "General support"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={
                            SUPPORT_TICKET_PRIORITY_BADGES[ticket.priority]
                          }
                        >
                          {SUPPORT_TICKET_PRIORITY_LABELS[ticket.priority]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={SUPPORT_TICKET_STATUS_BADGES[ticket.status]}
                        >
                          {SUPPORT_TICKET_ADMIN_STATUS_LABELS[ticket.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {ticket.assigneeName ?? "Unassigned"}
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {formatSupportDate(ticket.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {pageData.tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/admin/support/${ticket.id}`}
                  className="block p-5 hover:bg-surface-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {ticket.ticketNumber}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {ticket.title}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {ticket.clientName} - {ticket.projectName ?? "General support"}
                      </p>
                    </div>
                    <Badge variant={SUPPORT_TICKET_STATUS_BADGES[ticket.status]}>
                      {SUPPORT_TICKET_ADMIN_STATUS_LABELS[ticket.status]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-secondary">
                    <Badge
                      variant={SUPPORT_TICKET_PRIORITY_BADGES[ticket.priority]}
                    >
                      {SUPPORT_TICKET_PRIORITY_LABELS[ticket.priority]}
                    </Badge>
                    <span>{ticket.assigneeName ?? "Unassigned"}</span>
                    <span>{formatSupportDate(ticket.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <nav
            aria-label="Support ticket pagination"
            className="flex items-center justify-between gap-4"
          >
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} - {pageData.total}{" "}
              ticket{pageData.total === 1 ? "" : "s"}
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
