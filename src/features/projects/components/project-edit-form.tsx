"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { updateProjectAction } from "../actions";
import {
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from "../constants";
import { projectEditSchema, type ProjectEditInput } from "../schemas";
import type { ProjectActionResult, ProjectDetail } from "../types";

function defaultsFromProject(project: ProjectDetail): ProjectEditInput {
  return {
    name: project.name,
    description: project.description ?? "",
    status: project.status,
    priority: project.priority,
    startDate: project.start_date ?? "",
    targetDate: project.target_date ?? "",
    projectManagerId: project.project_manager_id ?? "",
  };
}

interface ProjectEditFormProps {
  project: ProjectDetail;
  managers: { id: string; fullName: string }[];
}

export function ProjectEditForm({ project, managers }: ProjectEditFormProps) {
  const [result, setResult] = useState<ProjectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProjectEditInput>({
    resolver: zodResolver(projectEditSchema),
    defaultValues: defaultsFromProject(project),
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await updateProjectAction(project.id, values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(
          response.fieldErrors,
        )) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof ProjectEditInput, { message });
          }
        }
      }

      if (response) {
        setResult(response);
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>
            Client: {project.clientName}. The client relationship is set at
            creation and cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField
              id="name"
              label="Project name"
              required
              error={errors.name?.message}
            >
              <Input
                id="name"
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField
              id="description"
              label="Description"
              error={errors.description?.message}
            >
              <Textarea
                id="description"
                aria-invalid={Boolean(errors.description)}
                {...register("description")}
              />
            </FormField>
          </div>
          <FormField
            id="status"
            label="Status"
            required
            error={errors.status?.message}
          >
            <Select
              id="status"
              aria-invalid={Boolean(errors.status)}
              {...register("status")}
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="priority"
            label="Priority"
            required
            error={errors.priority?.message}
          >
            <Select
              id="priority"
              aria-invalid={Boolean(errors.priority)}
              {...register("priority")}
            >
              {PROJECT_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PROJECT_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="projectManagerId"
            label="Project manager"
            error={errors.projectManagerId?.message}
          >
            <Select
              id="projectManagerId"
              aria-invalid={Boolean(errors.projectManagerId)}
              {...register("projectManagerId")}
            >
              <option value="">Unassigned</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.fullName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="startDate"
            label="Start date"
            error={errors.startDate?.message}
          >
            <Input
              id="startDate"
              type="date"
              aria-invalid={Boolean(errors.startDate)}
              {...register("startDate")}
            />
          </FormField>
          <FormField
            id="targetDate"
            label="Target date"
            error={errors.targetDate?.message}
          >
            <Input
              id="targetDate"
              type="date"
              aria-invalid={Boolean(errors.targetDate)}
              {...register("targetDate")}
            />
          </FormField>
        </CardContent>
      </Card>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {result.message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href={`/admin/projects/${project.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-white px-4 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
