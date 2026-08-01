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
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABELS,
} from "@/features/support/constants";

import { createPortalSupportTicketAction } from "../actions";
import {
  portalSupportTicketCreateSchema,
  type PortalSupportTicketCreateInput,
} from "../schemas";
import type { PortalSupportActionResult } from "../types";

interface PortalSupportTicketCreateFormProps {
  projects: { id: string; name: string }[];
}

export function PortalSupportTicketCreateForm({
  projects,
}: PortalSupportTicketCreateFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<PortalSupportActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PortalSupportTicketCreateInput>({
    resolver: zodResolver(portalSupportTicketCreateSchema),
    defaultValues: {
      projectId: "",
      title: "",
      description: "",
      category: "",
      priority: "medium",
    },
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await createPortalSupportTicketAction(values);

      if (response.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof PortalSupportTicketCreateInput, {
              message,
            });
          }
        }
      }

      setResult(response);
      if (response.ok && response.ticketId) {
        router.push(`/portal/support/${response.ticketId}`);
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormField
        id="portal-support-project"
        label="Project"
        hint="Optional. Choose a project if this request relates to one."
        error={errors.projectId?.message}
      >
        <Select
          id="portal-support-project"
          {...register("projectId")}
        >
          <option value="">General support</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        id="portal-support-title"
        label="What do you need help with?"
        required
        error={errors.title?.message}
      >
        <Input id="portal-support-title" {...register("title")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="portal-support-category"
          label="Category"
          hint="Optional, for example Website or Hosting"
          error={errors.category?.message}
        >
          <Input id="portal-support-category" {...register("category")} />
        </FormField>
        <FormField id="portal-support-priority" label="Priority" required>
          <Select id="portal-support-priority" {...register("priority")}>
            {SUPPORT_TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {SUPPORT_TICKET_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField
        id="portal-support-description"
        label="Tell us what happened"
        hint="Include what you expected, what happened instead, and any steps that reproduce the issue."
        required
        error={errors.description?.message}
      >
        <Textarea
          id="portal-support-description"
          {...register("description")}
        />
      </FormField>

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
          {isPending ? "Sending..." : "Send support request"}
        </Button>
      </div>
    </form>
  );
}
