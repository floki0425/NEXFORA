"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ProjectsError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Projects could not be loaded"
      description="The delivery workspace is temporarily unavailable. No project data was changed."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
