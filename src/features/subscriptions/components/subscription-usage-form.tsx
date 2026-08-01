"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { recordSubscriptionUsageAction } from "../actions";
import {
  subscriptionUsageSchema,
  type SubscriptionUsageInput,
} from "../schemas";
import type { SubscriptionActionResult } from "../types";

function todayInManila(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function SubscriptionUsageForm({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const defaultUsageDate = todayInManila();
  const [result, setResult] = useState<SubscriptionActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SubscriptionUsageInput>({
    resolver: zodResolver(subscriptionUsageSchema),
    defaultValues: {
      description: "",
      hoursUsed: "",
      usageDate: defaultUsageDate,
    },
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await recordSubscriptionUsageAction(
        subscriptionId,
        values,
      );

      if (response.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof SubscriptionUsageInput, { message });
          }
        }
      }

      setResult(response);
      if (response.ok) {
        reset({
          description: "",
          hoursUsed: "",
          usageDate: values.usageDate,
        });
      }
    });
  });

  // Commit the action result first, then start a fresh document request.
  // router.refresh() was tried both inside and outside the transition and
  // did not reliably re-render this route: the ledger kept showing "No
  // usage recorded" with Used 0h / Remaining 10h even though the entry was
  // already committed and revalidatePath() had run, and calling it inside
  // the transition additionally left the button stuck on "Recording…".
  // Because used/remaining hours are derived server-side from the ledger,
  // showing stale totals here would directly contradict the "never deduct
  // hours invisibly" rule, so this uses the same full-reload approach
  // already adopted for the file upload forms.
  useEffect(() => {
    if (!result?.ok) {
      return;
    }

    window.location.reload();
  }, [result]);

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField
        id="usageDescription"
        label="Work completed"
        required
        error={errors.description?.message}
      >
        <Textarea
          id="usageDescription"
          rows={3}
          {...register("description")}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <FormField
          id="hoursUsed"
          label="Hours used"
          required
          error={errors.hoursUsed?.message}
        >
          <Input
            id="hoursUsed"
            inputMode="decimal"
            {...register("hoursUsed")}
          />
        </FormField>
        <FormField
          id="usageDate"
          label="Date"
          required
          error={errors.usageDate?.message}
        >
          <Input id="usageDate" type="date" {...register("usageDate")} />
        </FormField>
      </div>

      <p className="text-xs leading-5 text-text-muted">
        Usage entries are permanent. Add a new correction entry instead of
        silently changing recorded work.
      </p>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {result.message}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Recording…" : "Record usage"}
      </Button>
    </form>
  );
}
