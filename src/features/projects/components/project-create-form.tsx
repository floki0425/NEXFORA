"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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

import { createProjectAction } from "../actions";
import {
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_LABELS,
} from "../constants";
import {
  projectCreateSchema,
  type ProjectCreateInput,
} from "../schemas";
import type { ProjectActionResult, ProjectManagerOption } from "../types";

interface ProjectCreateFormProps {
  clients: { id: string; businessName: string }[];
  managers: ProjectManagerOption[];
  defaultClientId?: string;
}

export function ProjectCreateForm({
  clients,
  managers,
  defaultClientId,
}: ProjectCreateFormProps) {
  const [result, setResult] = useState<ProjectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProjectCreateInput>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      name: "",
      description: "",
      priority: "medium",
      startDate: "",
      targetDate: "",
      projectManagerId: "",
    },
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await createProjectAction(values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(
          response.fieldErrors,
        )) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof ProjectCreateInput, { message });
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
            Every project belongs to exactly one client in your organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField
              id="clientId"
              label="Client"
              required
              error={errors.clientId?.message}
            >
              <Select
                id="clientId"
                aria-invalid={Boolean(errors.clientId)}
                {...register("clientId")}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.businessName}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
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

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
