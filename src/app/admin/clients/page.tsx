import { BriefcaseBusiness, Search } from "lucide-react";
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
  CLIENT_STATUSES,
  CLIENT_STATUS_BADGES,
  CLIENT_STATUS_LABELS,
} from "@/features/clients/constants";
import { formatClientDate } from "@/features/clients/format";
import { getClientPage } from "@/features/clients/queries";
import { clientFiltersSchema } from "@/features/clients/schemas";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Clients",
  description: "Review and manage organization client records.",
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
  return `/admin/clients?${params.toString()}`;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = clientFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    page: one(raw.page) || "1",
  });
  const pageData = await getClientPage(member.organizationId, filters);
  const hasFilters = Boolean(filters.query || filters.status);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Relationships"
        title="Clients"
        description="Keep client contact details, status, and CRM source history in one organization-scoped workspace."
      />

      <Card className="p-4 sm:p-5">
        <form
          method="get"
          className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_auto]"
        >
          <label className="relative">
            <span className="sr-only">Search clients</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search business, contact, or email"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {CLIENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CLIENT_STATUS_LABELS[status]}
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
            href="/admin/clients"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title={hasFilters ? "No matching clients" : "No clients yet"}
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : "Won leads can be converted from their lead detail page. Converted clients will appear here."
            }
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Clients sorted by most recently updated
                </caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Client
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Primary contact
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.clients.map((client) => (
                    <tr key={client.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-semibold text-foreground hover:text-accent"
                        >
                          {client.business_name}
                        </Link>
                        <p className="mt-1 text-text-muted">{client.email}</p>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {client.contact_name}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={CLIENT_STATUS_BADGES[client.status]}>
                          {CLIENT_STATUS_LABELS[client.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-text-secondary">
                        {formatClientDate(client.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {pageData.clients.map((client) => (
                <Link
                  key={client.id}
                  href={`/admin/clients/${client.id}`}
                  className="block p-5 hover:bg-surface-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {client.business_name}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {client.contact_name}
                      </p>
                    </div>
                    <Badge variant={CLIENT_STATUS_BADGES[client.status]}>
                      {CLIENT_STATUS_LABELS[client.status]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>{client.email}</span>
                    <span>{formatClientDate(client.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <nav
            aria-label="Client list pagination"
            className="flex items-center justify-between gap-4"
          >
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} · {pageData.total}{" "}
              client{pageData.total === 1 ? "" : "s"}
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
