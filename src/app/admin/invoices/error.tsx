"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function InvoicesError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Invoices could not be loaded"
      description="The finance workspace is temporarily unavailable. No invoice data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
