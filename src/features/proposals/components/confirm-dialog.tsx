"use client";

import { useRef } from "react";

import { Button, type ButtonVariant } from "@/components/ui/button";

interface ConfirmDialogProps {
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  isPending: boolean;
  disabled?: boolean;
}

export function ConfirmDialog({
  triggerLabel,
  triggerVariant = "primary",
  title,
  description,
  confirmLabel,
  onConfirm,
  isPending,
  disabled,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
      >
        {triggerLabel}
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl border border-border bg-white p-0 shadow-md backdrop:bg-nexfora-black/40"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="p-6">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                onConfirm();
                dialogRef.current?.close();
              }}
            >
              {isPending ? "Please wait…" : confirmLabel}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
