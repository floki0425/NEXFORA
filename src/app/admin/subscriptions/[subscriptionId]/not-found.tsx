import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function SubscriptionNotFound() {
  return (
    <ErrorState
      title="Maintenance subscription not found"
      description="This subscription does not exist or is not available to your organization."
      action={
        <Link
          href="/admin/subscriptions"
          className={buttonStyles({ variant: "secondary" })}
        >
          Back to subscriptions
        </Link>
      }
    />
  );
}
