"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

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

import { createInternalSupportTicketAction } from "../actions";
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABELS,
} from "../constants";
import {
  internalSupportTicketCreateSchema,
  type InternalSupportTicketCreateInput,
} from "../schemas";
import type {
  SupportActionResult,
  SupportClientOption,
  SupportProjectOption,
} from "../types";

interface SupportTicketCreateFormProps {
  clients: SupportClientOption[];
  projects: SupportProjectOption[];
  defaultClientId?: string;
}

export function SupportTicketCreateForm({
  clients,
  projects,
  defaultClientId,
}: SupportTicketCreateFormProps) {
  const [result, setResult] = useState<SupportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<InternalSupportTicketCreateInput>({
    resolver: zodResolver(internalSupportTicketCreateSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      projectId: "",
      title: "",
      description: "",
      category: "",
      priority: "medium",
    },
  });

  const selectedClientId = useWatch({
    control,
    name: "clientId",
    defaultValue: defaultClientId ?? "",
  });
  const clientProjects = useMemo(
    () => projects.filter((project) => project.clientId === selectedClientId),
    [projects, selectedClientId],
  );

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await createInternalSupportTicketAction(values);

      if (response.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof InternalSupportTicketCreateInput, {
              message,
            });
          }
        }
      }

      setResult(response);
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Support request</CardTitle>
          <CardDescription>
            The organization, official ticket number, and activity actor are
            assigned securely on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
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
              onChange={(event) => {
                register("clientId").onChange(event);
                setValue("projectId", "");
              }}
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="projectId"
            label="Project"
            hint="Optional. Only projects belonging to the selected client are shown."
            error={errors.projectId?.message}
          >
            <Select
              id="projectId"
              disabled={!selectedClientId}
              {...register("projectId")}
            >
              <option value="">General support</option>
              {clientProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="title"
            label="Title"
            required
            error={errors.title?.message}
          >
            <Input id="title" {...register("title")} />
          </FormField>
          <FormField
            id="category"
            label="Category"
            hint="Optional, for example Website or Hosting"
            error={errors.category?.message}
          >
            <Input id="category" {...register("category")} />
          </FormField>
          <FormField id="priority" label="Priority" required>
            <Select id="priority" {...register("priority")}>
              {SUPPORT_TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {SUPPORT_TICKET_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="md:col-span-2">
            <FormField
              id="description"
              label="Description"
              required
              error={errors.description?.message}
            >
              <Textarea id="description" {...register("description")} />
            </FormField>
          </div>
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
          {isPending ? "Creating..." : "Create support ticket"}
        </Button>
      </div>
    </form>
  );
}
