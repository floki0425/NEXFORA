"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { markAllNotificationsReadAction } from "../actions";

export function MarkAllReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Marking..." : "Mark all read"}
      </Button>
      {message ? (
        <p role="status" className="text-xs text-text-secondary">
          {message}
        </p>
      ) : null}
    </div>
  );
}
