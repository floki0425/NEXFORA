"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { transitionRevisionStatusAction } from "../actions";
import {
  REVISION_NEXT_INTERNAL_TRANSITION,
  type RevisionStatus,
} from "../constants";

interface RevisionStatusFormProps {
  revisionId: string;
  currentStatus: RevisionStatus;
}

export function RevisionStatusForm({
  revisionId,
  currentStatus,
}: RevisionStatusFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = REVISION_NEXT_INTERNAL_TRANSITION[currentStatus];

  if (!next) {
    return null;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const response = await transitionRevisionStatusAction(
              revisionId,
              { status: next.status },
            );
            if (!response.ok) {
              setError(response.message);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "Updating…" : next.label}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
