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

import { updateSubscriptionAction } from "../actions";
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
} from "../constants";
import { timestampToDateInput } from "../format";
import {
  subscriptionEditSchema,
  type SubscriptionEditInput,
} from "../schemas";
import type { SubscriptionActionResult, SubscriptionDetail } from "../types";

function defaultsFromSubscription(
  subscription: SubscriptionDetail,
): SubscriptionEditInput {
  return {
    planName: subscription.plan_name,
    status: subscription.status,
    billingCycle: subscription.billing_cycle,
    amount: String(subscription.amount),
    currency: subscription.currency,
    includedHours:
      subscription.included_hours === null
        ? ""
        : String(subscription.included_hours),
    startedAt: timestampToDateInput(subscription.started_at),
    renewalAt: timestampToDateInput(subscription.renewal_at),
    notes: subscription.notes ?? "",
  };
}

export function SubscriptionEditForm({
  subscription,
}: {
  subscription: SubscriptionDetail;
}) {
  const router = useRouter();
  const [result, setResult] = useState<SubscriptionActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SubscriptionEditInput>({
    resolver: zodResolver(subscriptionEditSchema),
    defaultValues: defaultsFromSubscription(subscription),
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await updateSubscriptionAction(subscription.id, values);

      if (response.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof SubscriptionEditInput, { message });
          }
        }
      }

      setResult(response);
      if (response.ok) {
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField
        id="planName"
        label="Plan name"
        required
        error={errors.planName?.message}
      >
        <Input id="planName" {...register("planName")} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <FormField id="status" label="Status" required>
          <Select id="status" {...register("status")}>
            {SUBSCRIPTION_STATUSES.map((status) => (
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
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
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
        hint="Blank means no tracked allowance."
        error={errors.includedHours?.message}
      >
        <Input
          id="includedHours"
          inputMode="decimal"
          {...register("includedHours")}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
          hint="No automatic charge occurs."
          error={errors.renewalAt?.message}
        >
          <Input id="renewalAt" type="date" {...register("renewalAt")} />
        </FormField>
      </div>

      <FormField
        id="notes"
        label="Internal notes"
        hint="Never shown to the client."
        error={errors.notes?.message}
      >
        <Textarea id="notes" rows={4} {...register("notes")} />
      </FormField>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {result.message}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
