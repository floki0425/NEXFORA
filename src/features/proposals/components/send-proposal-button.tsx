"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { sendProposalAction } from "../actions";
import type { ProposalActionResult } from "../types";

export function SendProposalButton({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ProposalActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              "Send this proposal to the client? This assigns the official proposal number and cannot be undone.",
            )
          ) {
            return;
          }

          startTransition(async () => {
            const response = await sendProposalAction(proposalId);
            setResult(response);
            router.refresh();
          });
        }}
      >
        {isPending ? "Sending…" : "Send proposal"}
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
