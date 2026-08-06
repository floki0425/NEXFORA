"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function LeadSourcesReportError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="We couldn't load this page"
      description="The lead source report is temporarily unavailable. No data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
