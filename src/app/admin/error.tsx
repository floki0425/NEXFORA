"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

interface AdminErrorProps {
  reset: () => void;
}

export default function AdminError({ reset }: AdminErrorProps) {
  return (
    <ErrorState
      title="We couldn't load the admin workspace"
      description="Your account data was not changed. Try loading this page again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
