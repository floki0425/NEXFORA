"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/features/proposals/components/confirm-dialog";

import {
  closePortalSupportTicketAction,
  reopenPortalSupportTicketAction,
} from "../actions";
import { portalSupportReopenSchema } from "../schemas";
import type { PortalSupportActionResult } from "../types";

function ReopenSupportDialog({
  ticketId,
  disabled,
  onSuccess,
}: {
  ticketId: string;
  disabled: boolean;
  onSuccess: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PortalSupportActionResult | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ comment: string }>({
    resolver: zodResolver(portalSupportReopenSchema),
    defaultValues: { comment: "" },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await reopenPortalSupportTicketAction(ticketId, values);
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
        The issue still exists
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-border bg-white p-0 shadow-md backdrop:bg-nexfora-black/40"
        aria-labelledby="reopen-support-title"
      >
        <form onSubmit={submit} noValidate className="p-6">
          <h2
            id="reopen-support-title"
            className="text-base font-semibold text-foreground"
          >
            Tell us what is still happening
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Your note will reopen this request and return it to the Nexfora
            team.
          </p>
          <div className="mt-4">
            <FormField
              id="support-reopen-comment"
              label="What is still not working?"
              required
              error={errors.comment?.message}
            >
              <Textarea
                id="support-reopen-comment"
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
              {isPending ? "Sending..." : "Reopen request"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function PortalSupportResolutionActions({
  ticketId,
}: {
  ticketId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Commit the action result first, then start a fresh document request.
  // router.refresh() inside the transition did not reliably re-render this
  // route, leaving the client looking at the pre-change status, resolution
  // note, and activity timeline even though their close/reopen had already
  // been committed. Matches the approach already adopted for the file
  // upload forms.
  useEffect(() => {
    if (!message?.ok) {
      return;
    }

    window.location.reload();
  }, [message]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <ConfirmDialog
          triggerLabel="Confirm this is fixed"
          title="Close this support request?"
          description="Confirm only if the issue is resolved. This will close the ticket and preserve its history."
          confirmLabel="Yes, close request"
          isPending={isPending}
          onConfirm={() => {
            setMessage(null);
            startTransition(async () => {
              const response = await closePortalSupportTicketAction(ticketId);
              setMessage({ ok: response.ok, text: response.message });
            });
          }}
        />
        <ReopenSupportDialog
          ticketId={ticketId}
          disabled={isPending}
          onSuccess={() => setMessage({ ok: true, text: "Request reopened." })}
        />
      </div>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
