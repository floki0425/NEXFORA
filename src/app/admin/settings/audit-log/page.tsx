import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { AuditLogTable } from "@/features/audit/components/audit-log-table";
import { NOTIFICATION_EVENT_LABELS } from "@/features/notifications/constants";
import { getAuditLogPage } from "@/features/audit/queries";
import { requireSettingsAccess } from "@/lib/auth/settings-access";

export const metadata: Metadata = {
  title: "Audit log",
  description: "Immutable record of sensitive actions across the organization.",
};

const AUDIT_ENTITY_TYPES = [
  "lead",
  "client",
  "client_invitation",
  "project",
  "milestone",
  "project_member",
  "proposal",
  "invoice",
  "payment",
  "revision",
  "support_ticket",
  "subscription",
  "subscription_usage",
  "project_file",
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(
  filters: { entityType: string; action: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.action) params.set("action", filters.action);
  params.set("page", String(page));
  return `/admin/settings/audit-log?${params.toString()}`;
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSettingsAccess();
  const raw = await searchParams;
  const filters = {
    entityType: one(raw.entityType),
    action: one(raw.action),
    page: Math.max(1, Number.parseInt(one(raw.page) || "1", 10) || 1),
  };

  const pageData = await getAuditLogPage(filters);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Restricted"
        title="Audit log"
        description="An immutable, append-only record of sensitive actions across your organization. Read-only — no entry can be edited or deleted through the application."
      />

      <Card className="p-4 sm:p-5">
        <form
          method="get"
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label>
            <span className="sr-only">Filter by entity type</span>
            <Select name="entityType" defaultValue={filters.entityType}>
              <option value="">All entity types</option>
              {AUDIT_ENTITY_TYPES.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Filter by action</span>
            <Select name="action" defaultValue={filters.action}>
              <option value="">All actions</option>
              {Object.entries(NOTIFICATION_EVENT_LABELS).map(
                ([action, label]) => (
                  <option key={action} value={action}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </label>
          <button
            type="submit"
            className={buttonStyles({ variant: "secondary" })}
          >
            Apply
          </button>
        </form>
        {filters.entityType || filters.action ? (
          <Link
            href="/admin/settings/audit-log"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <AuditLogTable entries={pageData.entries} />
      </Card>

      <nav
        aria-label="Audit log pagination"
        className="flex items-center justify-between gap-4"
      >
        <p className="text-sm text-text-secondary">Page {pageData.page}</p>
        <div className="flex gap-2">
          {pageData.page > 1 ? (
            <Link
              href={pageHref(filters, pageData.page - 1)}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Previous
            </Link>
          ) : null}
          {pageData.pageCount > pageData.page ? (
            <Link
              href={pageHref(filters, pageData.page + 1)}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Next
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
