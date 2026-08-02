"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { assignSupportTicketAction } from "../actions";
import { supportTicketAssignSchema } from "../schemas";
import type { SupportActionResult } from "../types";

interface SupportTicketAssignFormProps {
  ticketId: string;
  currentAssigneeId: string | null;
  assignees: { id: string; fullName: string }[];
}

export function SupportTicketAssignForm({
  ticketId,
  currentAssigneeId,
  assignees,
}: SupportTicketAssignFormProps) {
  const [result, setResult] = useState<SupportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit } = useForm<{ assigneeId: string }>({
    resolver: zodResolver(supportTicketAssignSchema),
    defaultValues: { assigneeId: currentAssigneeId ?? "" },
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await assignSupportTicketAction(ticketId, values);
      setResult(response);
    });
  });

  // Commit the action result first, then start a fresh document request.
  // router.refresh() inside the transition did not reliably re-render this
  // route: an observed failure left the button stuck on "Saving..." and the
  // header still reading "Assigned to: Unassigned" even though the
  // assignment had been committed and revalidatePath() had run. The
  // available status transitions are derived from the persisted assignee,
  // so a stale header here also hides the next valid workflow action.
  // Matches the approach already adopted for the file upload forms.
  useEffect(() => {
    if (!result?.ok) {
      return;
    }

    window.location.reload();
  }, [result]);

  return (
    <form onSubmit={submit} className="space-y-3">
      <label
        className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
        htmlFor="support-assignee"
      >
        Assigned to
      </label>
      <Select
        id="support-assignee"
        disabled={isPending}
        {...register("assigneeId")}
      >
        <option value="">Unassigned</option>
        {assignees.map((assignee) => (
          <option key={assignee.id} value={assignee.id}>
            {assignee.fullName}
          </option>
        ))}
      </Select>
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-xs text-success" : "text-xs text-error"}
        >
          {result.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
        {isPending ? "Saving..." : "Update assignment"}
      </Button>
    </form>
  );
}
