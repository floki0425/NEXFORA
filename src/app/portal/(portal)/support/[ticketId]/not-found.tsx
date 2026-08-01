import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function PortalSupportNotFound() {
  return (
    <ErrorState
      title="Support request not found"
      description="This request does not exist or is not available to your account."
      action={
        <Link
          href="/portal/support"
          className={buttonStyles({ variant: "secondary" })}
        >
          Back to support
        </Link>
      }
    />
  );
}
