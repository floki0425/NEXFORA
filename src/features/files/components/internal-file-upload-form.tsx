"use client";

import { useActionState, useState } from "react";

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
      const result = await uploadInternalProjectFileAction(
        projectId,
        formData,
      );
      if (result.ok) {
        // Prepare a fresh idempotency key for the next upload attempt; a
        // failed attempt keeps the same key so a retry of the same file is
        // treated as one logical upload, not a duplicate.
        setIdempotencyKey(crypto.randomUUID());
      }
      return result;
    },
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4" encType="multipart/form-data">
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
