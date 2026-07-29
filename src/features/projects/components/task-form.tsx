"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createTaskAction } from "../actions";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "../constants";
import { taskFormSchema, type TaskFormInput } from "../schemas";
import type { MilestoneItem, ProjectActionResult } from "../types";

interface TaskFormProps {
  projectId: string;
  milestones: MilestoneItem[];
  assignees: { id: string; fullName: string }[];
}

export function TaskForm({ projectId, milestones, assignees }: TaskFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<ProjectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormInput>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      milestoneId: "",
      priority: "medium",
      assignedTo: "",
      dueDate: "",
    },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await createTaskAction(projectId, values);
      setResult(response);
      if (response.ok) {
        reset();
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <FormField id="title" label="Task title" error={errors.title?.message}>
        <Input id="title" {...register("title")} />
      </FormField>
      <FormField id="description" label="Description" error={errors.description?.message}>
        <Textarea id="description" {...register("description")} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="milestoneId" label="Milestone" error={errors.milestoneId?.message}>
          <Select id="milestoneId" {...register("milestoneId")}>
            <option value="">No milestone</option>
            {milestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="priority" label="Priority" error={errors.priority?.message}>
          <Select id="priority" {...register("priority")}>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{TASK_PRIORITY_LABELS[priority]}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="assignedTo" label="Assignee" error={errors.assignedTo?.message}>
          <Select id="assignedTo" {...register("assignedTo")}>
            <option value="">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>{assignee.fullName}</option>
            ))}
          </Select>
        </FormField>
        <FormField id="dueDate" label="Due date" error={errors.dueDate?.message}>
          <Input id="dueDate" type="date" {...register("dueDate")} />
        </FormField>
      </div>
      <div className="flex items-center justify-between gap-4">
        {result ? (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-success" : "text-sm text-error"}>
            {result.message}
          </p>
        ) : <span />}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add task"}
        </Button>
      </div>
    </form>
  );
}
