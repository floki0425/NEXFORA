"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

import { uploadPortalProjectFileAction } from "../actions";
import type { PortalFileActionResult } from "../types";

interface PortalFileUploadFormProps {
  projectId: string;
}

const INITIAL_STATE: PortalFileActionResult | null = null;

export function PortalFileUploadForm({ projectId }: PortalFileUploadFormProps) {
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [state, formAction, isPending] = useActionState(
    async (_previous: PortalFileActionResult | null, formData: FormData) => {
      const result = await uploadPortalProjectFileAction(projectId, formData);
      if (result.ok) {
        setIdempotencyKey(crypto.randomUUID());
      }
      return result;
    },
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <FormField id="portal-file" label="File" required>
        <input
          id="portal-file"
          name="file"
          type="file"
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
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Uploading…" : "Upload file"}
        </Button>
      </div>
    </form>
  );
}
