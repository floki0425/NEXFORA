import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function PortalInvoiceNotFound() {
  return (
    <ErrorState
      title="Invoice not found"
      description="This invoice does not exist or is not available to you."
      action={
        <Link
          href="/portal/invoices"
          className={buttonStyles({ variant: "secondary" })}
        >
          Back to invoices
        </Link>
      }
    />
  );
}
