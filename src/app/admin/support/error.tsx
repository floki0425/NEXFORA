"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminSupportError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Support tickets could not be loaded"
      description="The support workspace is temporarily unavailable. No ticket data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
