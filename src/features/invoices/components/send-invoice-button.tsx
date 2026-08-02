"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { sendInvoiceAction } from "../actions";
import type { InvoiceActionResult } from "../types";

export function SendInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<InvoiceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              "Send this invoice to the client? This assigns the official invoice number and cannot be undone.",
            )
          ) {
            return;
          }

          startTransition(async () => {
            const response = await sendInvoiceAction(invoiceId);
            setResult(response);
            router.refresh();
          });
        }}
      >
        {isPending ? "Sending…" : "Send invoice"}
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
