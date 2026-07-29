"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";

import {
  requestProposalChangesSchema,
  type RequestProposalChangesInput,
} from "../schemas";

interface RequestChangesDialogProps {
  disabled?: boolean;
  onSubmitMessage: (message: string) => Promise<{ ok: boolean; message: string }>;
  onSuccess: () => void;
}

export function RequestChangesDialog({
  disabled,
  onSubmitMessage,
  onSuccess,
}: RequestChangesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RequestProposalChangesInput>({
    resolver: zodResolver(requestProposalChangesSchema),
    defaultValues: { message: "" },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await onSubmitMessage(values.message);
      setResult(response);
      if (response.ok) {
        reset();
        onSuccess();
      }
    });
  });

  // Ref access happens here, in an effect, rather than inside the
  // handleSubmit-wrapped callback above.
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
        Request changes
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-border bg-white p-0 shadow-md backdrop:bg-nexfora-black/40"
        aria-labelledby="request-changes-title"
      >
        <form onSubmit={submit} noValidate className="p-6">
          <h2 id="request-changes-title" className="text-base font-semibold text-foreground">
            Request changes
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Let Nexfora know what you would like adjusted before you decide.
          </p>
          <div className="mt-4">
            <FormField
              id="request-changes-message"
              label="What would you like changed?"
              required
              error={errors.message?.message}
            >
              <Textarea id="request-changes-message" {...register("message")} />
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
