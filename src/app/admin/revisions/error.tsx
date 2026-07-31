"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function RevisionsError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Revisions could not be loaded"
      description="The revisions workspace is temporarily unavailable. No revision data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
