import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function InvoiceNotFound() {
  return (
    <ErrorState
      title="Invoice not found"
      description="This invoice does not exist or is not available to your organization."
      action={
        <Link href="/admin/invoices" className={buttonStyles({ variant: "secondary" })}>
          Back to invoices
        </Link>
      }
    />
  );
}
