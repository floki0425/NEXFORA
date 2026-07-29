import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ProposalNotFound() {
  return (
    <ErrorState
      title="Proposal not found"
      description="This proposal does not exist or is not available to your organization."
      action={
        <Link href="/admin/proposals" className={buttonStyles({ variant: "secondary" })}>
          Back to proposals
        </Link>
      }
    />
  );
}
