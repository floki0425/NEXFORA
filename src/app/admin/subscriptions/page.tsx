import { Plus, Search, Wrench } from "lucide-react";
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
  BILLING_CYCLE_LABELS,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_BADGES,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/features/subscriptions/constants";
import {
  formatHours,
  formatSubscriptionDate,
  formatSubscriptionMoney,
} from "@/features/subscriptions/format";
import { memberCanManageSubscriptions } from "@/features/subscriptions/permissions";
import { getSubscriptionPage } from "@/features/subscriptions/queries";
import { subscriptionFiltersSchema } from "@/features/subscriptions/schemas";
import type { SubscriptionFilters } from "@/features/subscriptions/types";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Maintenance subscriptions",
  description: "Track client maintenance plans, renewals, and service usage.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(filters: SubscriptionFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  params.set("page", String(page));
  return `/admin/subscriptions?${params.toString()}`;
}

function hoursLabel(
  usedHours: number,
  includedHours: number | null,
  remainingHours: number | null,
): { primary: string; secondary: string; hasOverage: boolean } {
  if (includedHours === null || remainingHours === null) {
    return {
      primary: `${formatHours(usedHours)}h used`,
      secondary: "No allowance set",
      hasOverage: false,
    };
  }

  if (remainingHours < 0) {
    return {
      primary: `${formatHours(usedHours)}h of ${formatHours(includedHours)}h`,
      secondary: `${formatHours(Math.abs(remainingHours))}h over allowance`,
      hasOverage: true,
    };
  }

  return {
    primary: `${formatHours(usedHours)}h of ${formatHours(includedHours)}h`,
    secondary: `${formatHours(remainingHours)}h remaining`,
    hasOverage: false,
  };
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filters = subscriptionFiltersSchema.parse({
    query: one(raw.query),
    status: one(raw.status),
    page: one(raw.page) || "1",
  });
  const pageData = await getSubscriptionPage(filters);
  const canManage = memberCanManageSubscriptions(member);
  const hasFilters = Boolean(filters.query || filters.status);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Post-launch"
        title="Maintenance subscriptions"
        description="Track recurring client plans, renewal dates, and the hours used for covered work."
        action={
          canManage ? (
            <Link href="/admin/subscriptions/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden="true" />
              New subscription
            </Link>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <form
          method="get"
          className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_auto]"
        >
          <label className="relative">
            <span className="sr-only">Search maintenance subscriptions</span>
            <Search
              className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-text-muted"
              aria-hidden="true"
            />
            <Input
              name="query"
              defaultValue={filters.query}
              placeholder="Search plan name"
              className="pl-10"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <Select name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SUBSCRIPTION_STATUS_LABELS[status]}
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
            href="/admin/subscriptions"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </Card>

      {pageData.subscriptions.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wrench}
            title={
              hasFilters
                ? "No matching subscriptions"
                : "No maintenance subscriptions yet"
            }
            description={
              hasFilters
                ? "Try changing or clearing the current filters."
                : canManage
                  ? "Create a maintenance plan for a client to get started."
                  : "Maintenance subscriptions created for your organization will appear here."
            }
            action={
              canManage && !hasFilters ? (
                <Link href="/admin/subscriptions/new" className={buttonStyles()}>
                  Create first subscription
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Maintenance subscriptions sorted by most recently updated
                </caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Plan / Client
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Billing
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Hours
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Renewal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageData.subscriptions.map((subscription) => {
                    const hours = hoursLabel(
                      subscription.usedHours,
                      subscription.included_hours,
                      subscription.remainingHours,
                    );
                    return (
                      <tr
                        key={subscription.id}
                        data-testid="subscription-row"
                        className="hover:bg-surface-muted/60"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/admin/subscriptions/${subscription.id}`}
                            className="font-semibold text-foreground hover:text-accent"
                          >
                            {subscription.plan_name}
                          </Link>
                          <p className="mt-1 text-xs text-text-muted">
                            {subscription.clientName}
                            {subscription.projectName
                              ? ` · ${subscription.projectName}`
                              : ""}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant={
                              SUBSCRIPTION_STATUS_BADGES[subscription.status]
                            }
                          >
                            {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-text-secondary">
                          {formatSubscriptionMoney(
                            subscription.amount,
                            subscription.currency,
                          )}
                          <p className="text-xs text-text-muted">
                            {BILLING_CYCLE_LABELS[subscription.billing_cycle]}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-text-secondary">
                          {hours.primary}
                          <p
                            className={
                              hours.hasOverage
                                ? "text-xs font-medium text-error"
                                : "text-xs text-text-muted"
                            }
                          >
                            {hours.secondary}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-text-secondary">
                          {formatSubscriptionDate(subscription.renewal_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border lg:hidden">
              {pageData.subscriptions.map((subscription) => {
                const hours = hoursLabel(
                  subscription.usedHours,
                  subscription.included_hours,
                  subscription.remainingHours,
                );
                return (
                  <Link
                    key={subscription.id}
                    href={`/admin/subscriptions/${subscription.id}`}
                    className="block p-5 hover:bg-surface-muted"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">
                          {subscription.plan_name}
                        </p>
                        <p className="mt-1 text-sm text-text-muted">
                          {subscription.clientName}
                          {subscription.projectName
                            ? ` · ${subscription.projectName}`
                            : ""}
                        </p>
                      </div>
                      <Badge
                        variant={SUBSCRIPTION_STATUS_BADGES[subscription.status]}
                      >
                        {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                      <span>
                        {formatSubscriptionMoney(
                          subscription.amount,
                          subscription.currency,
                        )} · {BILLING_CYCLE_LABELS[subscription.billing_cycle]}
                      </span>
                      <span className={hours.hasOverage ? "text-error" : ""}>
                        {hours.secondary}
                      </span>
                      <span>
                        Renewal {formatSubscriptionDate(subscription.renewal_at)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          <nav
            aria-label="Maintenance subscription list pagination"
            className="flex items-center justify-between gap-4"
          >
            <p className="text-sm text-text-secondary">
              Page {pageData.page} of {pageData.pageCount} · {pageData.total} subscription{pageData.total === 1 ? "" : "s"}
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
