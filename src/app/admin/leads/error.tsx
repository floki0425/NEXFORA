"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function LeadsError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Leads could not be loaded"
      description="The CRM workspace is temporarily unavailable. No lead data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
