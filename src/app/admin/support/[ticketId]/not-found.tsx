import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function AdminSupportNotFound() {
  return (
    <ErrorState
      title="Support ticket not found"
      description="This ticket does not exist or is not available to your organization."
      action={
        <Link
          href="/admin/support"
          className={buttonStyles({ variant: "secondary" })}
        >
          Back to support
        </Link>
      }
    />
  );
}
