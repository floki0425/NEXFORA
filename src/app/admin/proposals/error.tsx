"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ProposalsError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Proposals could not be loaded"
      description="The sales workspace is temporarily unavailable. No proposal data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
