"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { voidInvoiceAction } from "../actions";
import type { InvoiceActionResult } from "../types";

export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<InvoiceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        variant="destructive"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              "Void this invoice? This cannot be undone and the invoice number cannot be reused.",
            )
          ) {
            return;
          }

          startTransition(async () => {
            const response = await voidInvoiceAction(invoiceId);
            setResult(response);
            router.refresh();
          });
        }}
      >
        {isPending ? "Voiding…" : "Void invoice"}
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
