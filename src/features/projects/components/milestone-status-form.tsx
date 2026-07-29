"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { Select } from "@/components/ui/select";

import { updateMilestoneStatusAction } from "../actions";
import { MILESTONE_STATUSES, MILESTONE_STATUS_LABELS, type MilestoneStatus } from "../constants";
import { milestoneStatusSchema } from "../schemas";

interface MilestoneStatusFormProps {
  projectId: string;
  milestoneId: string;
  currentStatus: MilestoneStatus;
}

export function MilestoneStatusForm({
  projectId,
  milestoneId,
  currentStatus,
}: MilestoneStatusFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit } = useForm<{ status: MilestoneStatus }>({
    resolver: zodResolver(milestoneStatusSchema),
    defaultValues: { status: currentStatus },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      await updateMilestoneStatusAction(projectId, milestoneId, values);
      router.refresh();
    });
  });

  return (
    <form onChange={submit}>
      <label className="sr-only" htmlFor={`milestone-status-${milestoneId}`}>
        Milestone status
      </label>
      <Select
        id={`milestone-status-${milestoneId}`}
        className="min-h-9 py-0 text-sm"
        disabled={isPending}
        {...register("status")}
      >
        {MILESTONE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {MILESTONE_STATUS_LABELS[status]}
          </option>
        ))}
      </Select>
    </form>
  );
}
