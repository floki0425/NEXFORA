"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { addLeadNoteAction } from "../actions";
import { leadNoteSchema } from "../schemas";
import type { ActionResult } from "../types";
import { FormField } from "./form-field";

interface NoteFields {
  note: string;
}

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NoteFields>({
    resolver: zodResolver(leadNoteSchema),
    defaultValues: { note: "" },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await addLeadNoteAction(leadId, values);
      setResult(response);
      if (response.ok) {
        reset();
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <FormField id="note" label="Add a note" error={errors.note?.message}>
        <Textarea id="note" placeholder="Record the latest conversation or next step…" {...register("note")} />
      </FormField>
      <div className="flex items-center justify-between gap-4">
        {result ? (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-success" : "text-sm text-error"}>
            {result.message}
          </p>
        ) : <span />}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
