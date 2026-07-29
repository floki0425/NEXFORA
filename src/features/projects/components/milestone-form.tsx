"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { createMilestoneAction } from "../actions";
import { milestoneFormSchema, type MilestoneFormInput } from "../schemas";
import type { ProjectActionResult } from "../types";

export function MilestoneForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ProjectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MilestoneFormInput>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: { title: "", description: "", dueDate: "" },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await createMilestoneAction(projectId, values);
      setResult(response);
      if (response.ok) {
        reset();
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <FormField id="title" label="Milestone title" error={errors.title?.message}>
          <Input id="title" {...register("title")} />
        </FormField>
        <FormField id="dueDate" label="Due date" error={errors.dueDate?.message}>
          <Input id="dueDate" type="date" {...register("dueDate")} />
        </FormField>
      </div>
      <FormField id="description" label="Description" error={errors.description?.message}>
        <Textarea id="description" {...register("description")} />
      </FormField>
      <div className="flex items-center justify-between gap-4">
        {result ? (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-success" : "text-sm text-error"}>
            {result.message}
          </p>
        ) : <span />}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add milestone"}
        </Button>
      </div>
    </form>
  );
}
