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

import { createInvoiceAction } from "../actions";
import { invoiceCreateSchema, type InvoiceCreateInput } from "../schemas";
import type { InvoiceActionResult } from "../types";

interface ProjectOptionWithClient {
  id: string;
  label: string;
  clientId: string;
}

interface InvoiceCreateFormProps {
  clients: { id: string; label: string }[];
  projects: ProjectOptionWithClient[];
  defaultClientId?: string;
}

export function InvoiceCreateForm({
  clients,
  projects,
  defaultClientId,
}: InvoiceCreateFormProps) {
  const [result, setResult] = useState<InvoiceActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<InvoiceCreateInput>({
    resolver: zodResolver(invoiceCreateSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      projectId: "",
      dueDate: "",
      discount: "0",
      tax: "0",
      notes: "",
    },
  });

  const selectedClientId = useWatch({
    control,
    name: "clientId",
    defaultValue: "",
  });
  const projectsForClient = useMemo(
    () => projects.filter((project) => project.clientId === selectedClientId),
    [projects, selectedClientId],
  );

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await createInvoiceAction(values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof InvoiceCreateInput, { message });
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
          <CardTitle>Invoice basics</CardTitle>
          <CardDescription>
            Line items, totals, and sending happen after the draft is created.
            The client cannot be changed once the draft exists.
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
              <option value="">No linked project</option>
              {projectsForClient.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="dueDate" label="Due date" error={errors.dueDate?.message}>
            <Input id="dueDate" type="date" {...register("dueDate")} />
          </FormField>
          <div />
          <FormField id="discount" label="Discount (PHP)" error={errors.discount?.message}>
            <Input id="discount" inputMode="decimal" {...register("discount")} />
          </FormField>
          <FormField id="tax" label="Tax (PHP)" error={errors.tax?.message}>
            <Input id="tax" inputMode="decimal" {...register("tax")} />
          </FormField>
          <div className="md:col-span-2">
            <FormField id="notes" label="Internal notes" hint="Never shown to the client." error={errors.notes?.message}>
              <Textarea id="notes" {...register("notes")} />
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
          {isPending ? "Creating…" : "Create draft invoice"}
        </Button>
      </div>
    </form>
  );
}
