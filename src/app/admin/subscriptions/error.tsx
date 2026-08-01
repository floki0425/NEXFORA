"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function SubscriptionsError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Maintenance subscriptions could not be loaded"
      description="The maintenance workspace is temporarily unavailable. No subscription data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
