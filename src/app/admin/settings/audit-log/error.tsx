"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminAuditLogError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <ErrorState
      title="The audit log could not be loaded"
      description="This workspace is temporarily unavailable. No audit data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
