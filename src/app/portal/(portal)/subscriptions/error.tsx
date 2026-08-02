"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function PortalSubscriptionsError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Your maintenance plans could not be loaded"
      description="Your maintenance information is temporarily unavailable. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
