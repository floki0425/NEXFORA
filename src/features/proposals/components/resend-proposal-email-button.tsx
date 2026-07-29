"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { resendProposalEmailAction } from "../actions";
import type { ProposalActionResult } from "../types";

export function ResendProposalEmailButton({
  proposalId,
}: {
  proposalId: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ProposalActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const response = await resendProposalEmailAction(proposalId);
            setResult(response);
            router.refresh();
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
