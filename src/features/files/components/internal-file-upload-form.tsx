"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

import { uploadInternalProjectFileAction } from "../actions";
import {
  FILE_CATEGORY_OPTIONS,
  FILE_VISIBILITIES,
  FILE_VISIBILITY_LABELS,
} from "../constants";
import type { FileActionResult } from "../types";

interface InternalFileUploadFormProps {
  projectId: string;
}

const INITIAL_STATE: FileActionResult | null = null;

export function InternalFileUploadForm({
  projectId,
}: InternalFileUploadFormProps) {
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [state, formAction, isPending] = useActionState(
    async (_previous: FileActionResult | null, formData: FormData) => {
      return uploadInternalProjectFileAction(projectId, formData);
    },
    INITIAL_STATE,
  );

  useEffect(() => {
    if (!state?.ok) {
      return;
    }

    // Commit the action result first, then start a fresh document request.
    // In production, refreshing this large file list inside the action's
    // RSC transition can leave the form pending or retain the old list even
    // though storage and metadata have already succeeded.
    window.location.reload();
  }, [state]);

  // No explicit encType on the form below: when `action` is a function,
  // React submits the form itself as FormData (multipart automatically when
  // it carries a file) and renders no encType attribute, so setting one
  // produced a real SSR/client hydration mismatch.
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <FormField id="file" label="File" required>
        <input
          id="file"
          name="file"
          type="file"
          required
          onChange={() => setIdempotencyKey(crypto.randomUUID())}
          className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-md file:border file:border-border-strong file:bg-white file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-surface-muted"
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="visibility" label="Visibility" required>
          <Select id="visibility" name="visibility" defaultValue="internal">
            {FILE_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {FILE_VISIBILITY_LABELS[visibility]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="category" label="Category" hint="Optional">
          <Select id="category" name="category" defaultValue="">
            <option value="">No category</option>
            {FILE_CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
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
