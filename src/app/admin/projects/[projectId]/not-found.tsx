import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ProjectNotFound() {
  return (
    <ErrorState
      title="Project not found"
      description="This project does not exist or is not available to your organization."
      action={
        <Link href="/admin/projects" className={buttonStyles({ variant: "secondary" })}>
          Back to projects
        </Link>
      }
    />
  );
}
