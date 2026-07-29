import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function PortalProjectNotFound() {
  return (
    <ErrorState
      title="Project not found"
      description="This project does not exist or is not available to you."
      action={
        <Link
          href="/portal/projects"
          className={buttonStyles({ variant: "secondary" })}
        >
          Back to projects
        </Link>
      }
    />
  );
}
