"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminNotificationsError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Notifications could not be loaded"
      description="The notifications workspace is temporarily unavailable. No notification data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
