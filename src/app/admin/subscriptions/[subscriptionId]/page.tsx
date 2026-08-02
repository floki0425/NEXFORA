import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SubscriptionEditForm } from "@/features/subscriptions/components/subscription-edit-form";
import { SubscriptionHoursSummary } from "@/features/subscriptions/components/subscription-hours-summary";
import { SubscriptionUsageForm } from "@/features/subscriptions/components/subscription-usage-form";
import {
  BILLING_CYCLE_LABELS,
  SUBSCRIPTION_STATUS_BADGES,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/features/subscriptions/constants";
import {
  formatHours,
  formatSubscriptionDate,
  formatSubscriptionMoney,
  formatUsageDate,
} from "@/features/subscriptions/format";
import {
  memberCanManageSubscriptions,
  memberCanRecordSubscriptionUsage,
} from "@/features/subscriptions/permissions";
import { getSubscriptionDetail } from "@/features/subscriptions/queries";
import { subscriptionIdSchema } from "@/features/subscriptions/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface SubscriptionDetailPageProps {
  params: Promise<{ subscriptionId: string }>;
}

export async function generateMetadata({
  params,
}: SubscriptionDetailPageProps): Promise<Metadata> {
  const { subscriptionId } = await params;
  return {
    title: subscriptionIdSchema.safeParse(subscriptionId).success
      ? "Maintenance subscription"
      : "Subscription not found",
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

export default async function SubscriptionDetailPage({
  params,
}: SubscriptionDetailPageProps) {
  const { subscriptionId } = await params;
  if (!subscriptionIdSchema.safeParse(subscriptionId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const subscription = await getSubscriptionDetail(subscriptionId);
  if (!subscription) {
    notFound();
  }

  const canManage = memberCanManageSubscriptions(member);
  const canRecordUsage = memberCanRecordSubscriptionUsage(member);

  return (
    <div className="space-y-7">
      <Link
        href="/admin/subscriptions"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to subscriptions
      </Link>

      <PageHeader
        eyebrow="Maintenance"
        title={subscription.plan_name}
        description={`${subscription.clientName}${
          subscription.projectName ? ` · ${subscription.projectName}` : ""
        }`}
      />

      <div
        className={
          canManage || canRecordUsage
            ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
            : "space-y-6"
        }
      >
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Plan overview</CardTitle>
                <Badge variant={SUBSCRIPTION_STATUS_BADGES[subscription.status]}>
                  {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                </Badge>
              </div>
              <CardDescription>
                Client and project links are fixed after creation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Client">{subscription.clientName}</DataItem>
                <DataItem label="Project">
                  {subscription.projectName ?? "No linked project"}
                </DataItem>
                <DataItem label="Billing">
                  {formatSubscriptionMoney(
                    subscription.amount,
                    subscription.currency,
                  )} · {BILLING_CYCLE_LABELS[subscription.billing_cycle]}
                </DataItem>
                <DataItem label="Renewal date">
                  {formatSubscriptionDate(subscription.renewal_at)}
                </DataItem>
                <DataItem label="Start date">
                  {formatSubscriptionDate(subscription.started_at)}
                </DataItem>
                <DataItem label="Cancelled">
                  {formatSubscriptionDate(subscription.cancelled_at)}
                </DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="Internal notes">
                    <span className="whitespace-pre-wrap">
                      {subscription.notes ?? "No internal notes"}
                    </span>
                  </DataItem>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Included hours</CardTitle>
              <CardDescription>
                Used and remaining hours are calculated from the permanent
                usage ledger below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SubscriptionHoursSummary
                includedHours={subscription.included_hours}
                usedHours={subscription.usedHours}
                remainingHours={subscription.remainingHours}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage history</CardTitle>
              <CardDescription>
                Append-only record of work covered by this maintenance plan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {subscription.usage.length === 0 ? (
                <EmptyState
                  title="No usage recorded"
                  description="Covered maintenance work will appear here after it is recorded."
                  className="py-8"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      Maintenance subscription usage history
                    </caption>
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Work completed
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Hours
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Date
                        </th>
                        <th scope="col" className="py-2 font-semibold">
                          Recorded by
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {subscription.usage.map((entry) => (
                        <tr key={entry.id}>
                          <td className="py-3 pr-3 font-medium text-foreground">
                            <span className="whitespace-pre-wrap">
                              {entry.description}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-text-secondary">
                            {formatHours(entry.hours_used)}h
                          </td>
                          <td className="py-3 pr-3 text-text-secondary">
                            {formatUsageDate(entry.usage_date)}
                          </td>
                          <td className="py-3 text-text-secondary">
                            {entry.recorderName ?? "System"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {canManage || canRecordUsage ? (
          <aside className="space-y-6">
            {canManage ? (
              <Card>
                <CardHeader>
                  <CardTitle>Update plan</CardTitle>
                  <CardDescription>
                    Changing to Cancelled records the cancellation time in the
                    same update.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SubscriptionEditForm subscription={subscription} />
                </CardContent>
              </Card>
            ) : null}

            {canRecordUsage ? (
              <Card>
                <CardHeader>
                  <CardTitle>Record usage</CardTitle>
                  <CardDescription>
                    Add work completed under this plan.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SubscriptionUsageForm subscriptionId={subscription.id} />
                </CardContent>
              </Card>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
