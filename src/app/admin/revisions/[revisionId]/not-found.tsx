import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function RevisionNotFound() {
  return (
    <ErrorState
      title="Revision not found"
      description="This revision does not exist or is not available to your organization."
      action={
        <Link href="/admin/revisions" className={buttonStyles({ variant: "secondary" })}>
          Back to revisions
        </Link>
      }
    />
  );
}
