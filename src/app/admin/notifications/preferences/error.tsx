"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminNotificationPreferencesError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Preferences could not be loaded"
      description="Your notification preferences are temporarily unavailable. Nothing was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
