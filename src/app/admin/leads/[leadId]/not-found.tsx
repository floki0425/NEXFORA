import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function LeadNotFound() {
  return (
    <ErrorState
      title="Lead not found"
      description="This lead does not exist, is outside your organization, or is not available to your account."
      action={<Link href="/admin/leads" className={buttonStyles()}>Return to leads</Link>}
    />
  );
}
