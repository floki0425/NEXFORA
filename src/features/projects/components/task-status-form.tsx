"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";

import { Select } from "@/components/ui/select";

import { updateTaskStatusAction } from "../actions";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "../constants";
import { taskStatusSchema } from "../schemas";

interface TaskStatusFormProps {
  projectId: string;
  taskId: string;
  currentStatus: TaskStatus;
}

export function TaskStatusForm({
  projectId,
  taskId,
  currentStatus,
}: TaskStatusFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit } = useForm<{ status: TaskStatus }>({
    resolver: zodResolver(taskStatusSchema),
    defaultValues: { status: currentStatus },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      await updateTaskStatusAction(projectId, taskId, values);
      router.refresh();
    });
  });

  return (
    <form onChange={submit}>
      <label className="sr-only" htmlFor={`task-status-${taskId}`}>
        Task status
      </label>
      <Select
        id={`task-status-${taskId}`}
        className="min-h-9 py-0 text-sm"
        disabled={isPending}
        {...register("status")}
      >
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {TASK_STATUS_LABELS[status]}
          </option>
        ))}
      </Select>
    </form>
  );
}
