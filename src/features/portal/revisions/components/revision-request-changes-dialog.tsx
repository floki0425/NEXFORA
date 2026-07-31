"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";

import { requestChangesSchema } from "../schemas";
import type { PortalRevisionActionResult } from "../types";

interface RevisionRequestChangesDialogProps {
  disabled?: boolean;
  onSubmitComment: (comment: string) => Promise<PortalRevisionActionResult>;
  onSuccess: () => void;
}

export function RevisionRequestChangesDialog({
  disabled,
  onSubmitComment,
  onSuccess,
}: RevisionRequestChangesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PortalRevisionActionResult | null>(
    null,
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ comment: string }>({
    resolver: zodResolver(requestChangesSchema),
    defaultValues: { comment: "" },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await onSubmitComment(values.comment);
      setResult(response);
      if (response.ok) {
        reset();
        onSuccess();
      }
    });
  });

  useEffect(() => {
    if (result?.ok) {
      dialogRef.current?.close();
    }
  }, [result]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        Request further changes
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-border bg-white p-0 shadow-md backdrop:bg-nexfora-black/40"
        aria-labelledby="revision-request-changes-title"
      >
        <form onSubmit={submit} noValidate className="p-6">
          <h2
            id="revision-request-changes-title"
            className="text-base font-semibold text-foreground"
          >
            Request further changes
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Let the team know what still needs to change before you approve
            this.
          </p>
          <div className="mt-4">
            <FormField
              id="revision-request-changes-comment"
              label="What would you like changed?"
              required
              error={errors.comment?.message}
            >
              <Textarea
                id="revision-request-changes-comment"
                {...register("comment")}
              />
            </FormField>
          </div>
          {result && !result.ok ? (
            <p className="mt-3 text-sm text-error" role="alert">
              {result.message}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
