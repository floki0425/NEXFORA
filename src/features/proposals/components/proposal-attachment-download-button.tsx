"use client";

import { useState, useTransition } from "react";

import { buttonStyles } from "@/components/ui/button";

import type { ProposalAttachmentDownloadResult } from "../types";

interface ProposalAttachmentDownloadButtonProps {
  /**
   * Opaque lookup key for the download action. The internal pages pass the
   * proposal id; the secure client page passes its raw access token. This
   * component never interprets it — it only hands it back to `action`, which
   * is what keeps one button usable from both contexts.
   */
  downloadKey: string;
  action: (
    downloadKey: string,
  ) => Promise<ProposalAttachmentDownloadResult>;
}

/**
 * Requests a short-lived signed URL just-in-time and opens it immediately —
 * no signed URL is ever rendered into the page or persisted anywhere.
 */
export function ProposalAttachmentDownloadButton({
  downloadKey,
  action,
}: ProposalAttachmentDownloadButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        className={buttonStyles({ variant: "secondary", size: "sm" })}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action(downloadKey);
            if (!result.ok || !result.url) {
              setError(result.message);
              return;
            }

            window.location.assign(result.url);
          });
        }}
      >
        {isPending ? "Preparing…" : "Download PDF"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
