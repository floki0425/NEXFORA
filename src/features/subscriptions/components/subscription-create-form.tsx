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

import { createSubscriptionAction } from "../actions";
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  SUBSCRIPTION_CURRENCY_DEFAULT,
  SUBSCRIPTION_CREATE_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
} from "../constants";
import {
  subscriptionCreateSchema,
  type SubscriptionCreateInput,
} from "../schemas";
import type {
  SubscriptionActionResult,
  SubscriptionClientOption,
  SubscriptionProjectOption,
} from "../types";

interface SubscriptionCreateFormProps {
  clients: SubscriptionClientOption[];
  projects: SubscriptionProjectOption[];
  defaultClientId?: string;
}

export function SubscriptionCreateForm({
  clients,
  projects,
  defaultClientId,
}: SubscriptionCreateFormProps) {
  const [result, setResult] = useState<SubscriptionActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<SubscriptionCreateInput>({
    resolver: zodResolver(subscriptionCreateSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      projectId: "",
      planName: "",
      status: "active",
      billingCycle: "monthly",
      amount: "0.00",
      currency: SUBSCRIPTION_CURRENCY_DEFAULT,
      includedHours: "",
      startedAt: "",
      renewalAt: "",
      notes: "",
    },
  });

  const selectedClientId = useWatch({
    control,
    name: "clientId",
    defaultValue: defaultClientId ?? "",
  });
  const projectsForClient = useMemo(
    () => projects.filter((project) => project.clientId === selectedClientId),
    [projects, selectedClientId],
  );

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await createSubscriptionAction(values);

      if (response.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof SubscriptionCreateInput, { message });
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
          <CardTitle>Plan details</CardTitle>
          <CardDescription>
            Client and project associations are protected and cannot be
            changed after this subscription is created.
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

          <FormField
            id="planName"
            label="Plan name"
            required
            error={errors.planName?.message}
          >
            <Input
              id="planName"
              aria-invalid={Boolean(errors.planName)}
              {...register("planName")}
            />
          </FormField>

          <FormField id="status" label="Status" required>
            <Select id="status" {...register("status")}>
              {SUBSCRIPTION_CREATE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SUBSCRIPTION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField id="billingCycle" label="Billing cycle" required>
            <Select id="billingCycle" {...register("billingCycle")}>
              {BILLING_CYCLES.map((cycle) => (
                <option key={cycle} value={cycle}>
                  {BILLING_CYCLE_LABELS[cycle]}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <FormField
              id="amount"
              label="Amount"
              required
              error={errors.amount?.message}
            >
              <Input id="amount" inputMode="decimal" {...register("amount")} />
            </FormField>
            <FormField
              id="currency"
              label="Currency"
              required
              error={errors.currency?.message}
            >
              <Input
                id="currency"
                maxLength={3}
                className="uppercase"
                {...register("currency")}
              />
            </FormField>
          </div>

          <FormField
            id="includedHours"
            label="Included hours"
            hint="Optional. Leave blank when the plan has no tracked allowance."
            error={errors.includedHours?.message}
          >
            <Input
              id="includedHours"
              inputMode="decimal"
              {...register("includedHours")}
            />
          </FormField>

          <FormField
            id="startedAt"
            label="Start date"
            hint="Optional"
            error={errors.startedAt?.message}
          >
            <Input id="startedAt" type="date" {...register("startedAt")} />
          </FormField>

          <FormField
            id="renewalAt"
            label="Renewal date"
            hint="Tracking only; no automatic charge will occur."
            error={errors.renewalAt?.message}
          >
            <Input id="renewalAt" type="date" {...register("renewalAt")} />
          </FormField>

          <div className="md:col-span-2">
            <FormField
              id="notes"
              label="Internal notes"
              hint="Never shown in the client portal."
              error={errors.notes?.message}
            >
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
          {isPending ? "Creating…" : "Create subscription"}
        </Button>
      </div>
    </form>
  );
}
