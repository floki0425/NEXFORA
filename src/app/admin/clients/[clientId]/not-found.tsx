import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ClientNotFound() {
  return (
    <ErrorState
      title="Client not found"
      description="This client does not exist or is not available to your organization."
      action={
        <Link
          href="/admin/clients"
          className={buttonStyles({ variant: "secondary" })}
        >
          Back to clients
        </Link>
      }
    />
  );
}
