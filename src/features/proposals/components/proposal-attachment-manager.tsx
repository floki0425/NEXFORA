"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";

import {
  removeProposalAttachmentAction,
  uploadProposalAttachmentAction,
} from "../actions";
import { formatFileSize } from "../format";
import type {
  ProposalActionResult,
  ProposalAttachmentSummary,
} from "../types";

interface ProposalAttachmentManagerProps {
  proposalId: string;
  attachment: ProposalAttachmentSummary | null;
}

const INITIAL_STATE: ProposalActionResult | null = null;

/**
 * Upload / replace / remove control for the proposal's single optional PDF.
 * Rendered only while the proposal is editable — the server actions enforce
 * that independently, so hiding this is presentation, not the access rule.
 */
export function ProposalAttachmentManager({
  proposalId,
  attachment,
}: ProposalAttachmentManagerProps) {
  const router = useRouter();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [isRemoving, startRemoveTransition] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [state, formAction, isUploading] = useActionState(
    async (_previous: ProposalActionResult | null, formData: FormData) => {
      return uploadProposalAttachmentAction(proposalId, formData);
    },
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  function handleRemove() {
    if (!window.confirm("Remove this attachment?")) {
      return;
    }

    setRemoveError(null);
    startRemoveTransition(async () => {
      const result = await removeProposalAttachmentAction(proposalId);
      if (!result.ok) {
        setRemoveError(result.message);
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Final PDF</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {attachment ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {attachment.fileName}
              </p>
              <p className="text-xs text-text-muted">
                {formatFileSize(attachment.fileSize)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isRemoving}
                onClick={handleRemove}
              >
                {isRemoving ? "Removing…" : "Remove"}
              </Button>
              {removeError ? (
                <p role="alert" className="text-xs text-error">
                  {removeError}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            No PDF attached yet. This is optional — the proposal can be sent
            without one.
          </p>
        )}

        {/*
          No explicit encType: when `action` is a function React submits the
          form as FormData (multipart when it carries a file) and renders no
          encType attribute, so setting one causes a hydration mismatch.
        */}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <FormField
            id="attachment-file"
            label={attachment ? "Replace PDF" : "Attach PDF"}
            hint="PDF only, up to 25 MB."
            required
          >
            <input
              id="attachment-file"
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
              onChange={() => setIdempotencyKey(crypto.randomUUID())}
              className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-md file:border file:border-border-strong file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-surface-muted"
            />
          </FormField>
          <div className="flex items-center justify-between gap-4">
            {state ? (
              <p
                role={state.ok ? "status" : "alert"}
                className={state.ok ? "text-sm text-success" : "text-sm text-error"}
              >
                {state.message}
              </p>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={isUploading}>
              {isUploading
                ? "Uploading…"
                : attachment
                  ? "Replace PDF"
                  : "Upload PDF"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
