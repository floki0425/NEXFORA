"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ClientsError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Clients could not be loaded"
      description="The client workspace is temporarily unavailable. No client data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
