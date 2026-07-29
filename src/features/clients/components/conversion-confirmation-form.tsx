"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { convertLeadToClientAction } from "../actions";
import type { ClientActionResult } from "../types";

export function ConversionConfirmationForm({
  leadId,
}: {
  leadId: string;
}) {
  const [result, setResult] = useState<ClientActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    startTransition(async () => {
      const response = await convertLeadToClientAction(leadId);
      if (response) {
        setResult(response);
      }
    });
  }

  return (
    <form onSubmit={submit}>
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "mb-4 text-sm text-success" : "mb-4 text-sm text-error"}
        >
          {result.message}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href={`/admin/leads/${leadId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-white px-4 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Converting…" : "Confirm conversion"}
        </Button>
      </div>
    </form>
  );
}
