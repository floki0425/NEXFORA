"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function PortalSupportError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Support could not be loaded"
      description="Your support requests are temporarily unavailable. No information was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
