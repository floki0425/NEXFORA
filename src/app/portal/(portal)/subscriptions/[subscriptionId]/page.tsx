import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPortalSubscriptionDetail } from "@/features/portal/subscriptions/queries";
import { portalSubscriptionIdSchema } from "@/features/portal/subscriptions/schemas";
import { SubscriptionHoursSummary } from "@/features/subscriptions/components/subscription-hours-summary";
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
import { requirePortalMember } from "@/lib/auth/portal";

interface PortalSubscriptionDetailPageProps {
  params: Promise<{ subscriptionId: string }>;
}

export const metadata: Metadata = {
  title: "Maintenance plan",
};

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

export default async function PortalSubscriptionDetailPage({
  params,
}: PortalSubscriptionDetailPageProps) {
  const { subscriptionId } = await params;
  if (!portalSubscriptionIdSchema.safeParse(subscriptionId).success) {
    notFound();
  }

  await requirePortalMember();
  const subscription = await getPortalSubscriptionDetail(subscriptionId);
  if (!subscription) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <Link
        href="/portal/subscriptions"
        className={buttonStyles({ variant: "ghost", size: "sm" })}
      >
        ← Back to maintenance
      </Link>

      <PageHeader
        title={subscription.planName}
        description="Your maintenance plan details and service usage."
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Plan summary</CardTitle>
            <Badge variant={SUBSCRIPTION_STATUS_BADGES[subscription.status]}>
              {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </Badge>
          </div>
          <CardDescription>
            A clear view of your current plan and next renewal date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <DataItem label="Plan amount">
              {formatSubscriptionMoney(
                subscription.amount,
                subscription.currency,
              )}
            </DataItem>
            <DataItem label="Billing cycle">
              {BILLING_CYCLE_LABELS[subscription.billingCycle]}
            </DataItem>
            <DataItem label="Renewal date">
              {formatSubscriptionDate(subscription.renewalAt)}
            </DataItem>
            <DataItem label="Project">
              {subscription.projectName ?? "Business-wide maintenance"}
            </DataItem>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your included hours</CardTitle>
          <CardDescription>
            Every recorded service entry contributes to the used-hours total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubscriptionHoursSummary
            includedHours={subscription.includedHours}
            usedHours={subscription.usedHours}
            remainingHours={subscription.remainingHours}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage history</CardTitle>
          <CardDescription>
            Work Nexfora has recorded under this maintenance plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscription.usage.length === 0 ? (
            <EmptyState
              title="No usage recorded yet"
              description="Covered maintenance work will appear here after it is completed."
              className="py-8"
            />
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {subscription.usage.map((entry) => (
                <div
                  key={entry.id}
                  data-testid="portal-subscription-usage-row"
                  className="flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div>
                    <p className="whitespace-pre-wrap text-sm font-medium text-foreground">
                      {entry.description}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {formatUsageDate(entry.usageDate)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatHours(entry.hoursUsed)}h
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
