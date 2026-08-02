"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { createPaymongoCheckoutAction } from "../actions";
import type { PortalInvoiceActionResult } from "../types";

export function PayWithPaymongoButton({ invoiceId }: { invoiceId: string }) {
  const [result, setResult] = useState<PortalInvoiceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const response = await createPaymongoCheckoutAction(invoiceId);
            setResult(response);
            // The browser redirect alone never marks this invoice paid —
            // only a verified webhook event does (see
            // reconcile_paymongo_webhook_event). This redirect only takes
            // the client to PayMongo's hosted checkout page.
            if (response.ok && response.checkoutUrl) {
              window.location.href = response.checkoutUrl;
            }
          });
        }}
      >
        {isPending ? "Preparing checkout…" : "Pay online"}
      </Button>
      {result && !result.ok ? (
        <p role="alert" className="text-sm text-error">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
