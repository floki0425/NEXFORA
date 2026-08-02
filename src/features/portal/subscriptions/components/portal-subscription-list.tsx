import { Wrench } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  BILLING_CYCLE_LABELS,
  SUBSCRIPTION_STATUS_BADGES,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/features/subscriptions/constants";
import {
  formatHours,
  formatSubscriptionDate,
  formatSubscriptionMoney,
} from "@/features/subscriptions/format";

import type { PortalSubscriptionListItem } from "../types";

function allowanceLabel(subscription: PortalSubscriptionListItem): {
  label: string;
  hasOverage: boolean;
} {
  if (
    subscription.includedHours === null ||
    subscription.remainingHours === null
  ) {
    return {
      label: `${formatHours(subscription.usedHours)}h used · no limit set`,
      hasOverage: false,
    };
  }

  if (subscription.remainingHours < 0) {
    return {
      label: `${formatHours(Math.abs(subscription.remainingHours))}h over allowance`,
      hasOverage: true,
    };
  }

  return {
    label: `${formatHours(subscription.remainingHours)}h remaining`,
    hasOverage: false,
  };
}

export function PortalSubscriptionList({
  subscriptions,
}: {
  subscriptions: PortalSubscriptionListItem[];
}) {
  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="No maintenance plan yet"
        description="Your active maintenance plans will appear here when Nexfora sets one up for your business."
      />
    );
  }

  return (
    <div className="divide-y divide-border border-t border-border">
      {subscriptions.map((subscription) => {
        const allowance = allowanceLabel(subscription);
        return (
          <Link
            key={subscription.id}
            href={`/portal/subscriptions/${subscription.id}`}
            data-testid="portal-subscription-row"
            className="block py-5 transition-colors hover:bg-surface-muted/60"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {subscription.planName}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {subscription.projectName ?? "Business-wide maintenance"}
                </p>
              </div>
              <Badge variant={SUBSCRIPTION_STATUS_BADGES[subscription.status]}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-secondary">
              <span>
                {formatSubscriptionMoney(
                  subscription.amount,
                  subscription.currency,
                )} · {BILLING_CYCLE_LABELS[subscription.billingCycle]}
              </span>
              <span className={allowance.hasOverage ? "text-error" : ""}>
                {allowance.label}
              </span>
              <span>
                Renewal {formatSubscriptionDate(subscription.renewalAt)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
