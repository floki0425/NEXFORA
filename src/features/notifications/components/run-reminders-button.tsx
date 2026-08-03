"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { runRemindersNowAction } from "../actions";

export function RunRemindersButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const result = await runRemindersNowAction();
      setMessage(result.message);
      setIsError(!result.ok);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Running..." : "Run reminders now"}
      </Button>
      {message ? (
        <p
          role="status"
          className={isError ? "text-xs text-error" : "text-xs text-text-secondary"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
