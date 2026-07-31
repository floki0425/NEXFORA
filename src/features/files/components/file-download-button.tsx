"use client";

import { useState, useTransition } from "react";

import { buttonStyles } from "@/components/ui/button";

interface FileDownloadButtonProps {
  fileId: string;
  action: (fileId: string) => Promise<{
    ok: boolean;
    message: string;
    url?: string;
    fileName?: string;
  }>;
}

/**
 * Requests a short-lived signed URL just-in-time and opens it immediately —
 * no signed URL is ever stored client-side beyond this single use, and none
 * is ever persisted server-side either.
 */
export function FileDownloadButton({
  fileId,
  action,
}: FileDownloadButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        className={buttonStyles({ variant: "secondary", size: "sm" })}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action(fileId);
            if (!result.ok || !result.url) {
              setError(result.message);
              return;
            }

            window.location.assign(result.url);
          });
        }}
      >
        {isPending ? "Preparing…" : "Download"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
