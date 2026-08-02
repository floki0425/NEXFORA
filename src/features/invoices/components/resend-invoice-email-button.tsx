"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { resendInvoiceEmailAction } from "../actions";
import type { InvoiceActionResult } from "../types";

export function ResendInvoiceEmailButton({ invoiceId }: { invoiceId: string }) {
  const [result, setResult] = useState<InvoiceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const response = await resendInvoiceEmailAction(invoiceId);
            setResult(response);
          });
        }}
      >
        {isPending ? "Resending…" : "Resend email"}
      </Button>
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
