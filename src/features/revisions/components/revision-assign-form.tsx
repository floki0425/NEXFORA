"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { assignRevisionAction } from "../actions";
import { revisionAssignSchema } from "../schemas";
import type { RevisionActionResult } from "../types";

interface RevisionAssignFormProps {
  revisionId: string;
  currentAssigneeId: string | null;
  assignees: { id: string; fullName: string }[];
}

export function RevisionAssignForm({
  revisionId,
  currentAssigneeId,
  assignees,
}: RevisionAssignFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<RevisionActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit } = useForm<{ assigneeId: string }>({
    resolver: zodResolver(revisionAssignSchema),
    defaultValues: { assigneeId: currentAssigneeId ?? "" },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await assignRevisionAction(revisionId, values);
      setResult(response);
      if (response.ok) {
        router.refresh();
      }
    });
  });

  return (
    <form onChange={submit} className="space-y-2">
      <label
        className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
        htmlFor="assigneeId"
      >
        Assigned to
      </label>
      <Select id="assigneeId" disabled={isPending} {...register("assigneeId")}>
        <option value="">Unassigned</option>
        {assignees.map((assignee) => (
          <option key={assignee.id} value={assignee.id}>
            {assignee.fullName}
          </option>
        ))}
      </Select>
      {result && !result.ok ? (
        <p role="alert" className="text-xs text-error">
          {result.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" variant="ghost" disabled={isPending}>
        {isPending ? "Saving…" : "Update assignment"}
      </Button>
    </form>
  );
}
