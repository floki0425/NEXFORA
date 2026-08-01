import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PortalSubscriptionList } from "@/features/portal/subscriptions/components/portal-subscription-list";
import { getPortalSubscriptions } from "@/features/portal/subscriptions/queries";
import { requirePortalMember } from "@/lib/auth/portal";

export const metadata: Metadata = {
  title: "Maintenance",
};

export default async function PortalSubscriptionsPage() {
  await requirePortalMember();
  const subscriptions = await getPortalSubscriptions();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Maintenance"
        description="See your maintenance plan, renewal date, and the work covered by your included hours."
      />

      <Card>
        <CardContent>
          <PortalSubscriptionList subscriptions={subscriptions} />
        </CardContent>
      </Card>
    </div>
  );
}
