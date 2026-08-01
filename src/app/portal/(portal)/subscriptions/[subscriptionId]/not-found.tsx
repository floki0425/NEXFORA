import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function PortalSubscriptionNotFound() {
  return (
    <ErrorState
      title="Maintenance plan not found"
      description="This maintenance plan does not exist or is not available to you."
      action={
        <Link
          href="/portal/subscriptions"
          className={buttonStyles({ variant: "secondary" })}
        >
          Back to maintenance
        </Link>
      }
    />
  );
}
