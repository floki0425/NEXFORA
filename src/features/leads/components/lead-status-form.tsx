"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { updateLeadStatusAction } from "../actions";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "../constants";
import { leadStatusSchema } from "../schemas";
import type { ActionResult } from "../types";

interface LeadStatusFormProps {
  leadId: string;
  currentStatus: LeadStatus;
  currentLostReason: string | null;
}

interface StatusFields {
  status: LeadStatus;
  lostReason: string;
}

export function LeadStatusForm({
  leadId,
  currentStatus,
  currentLostReason,
}: LeadStatusFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<StatusFields>({
    resolver: zodResolver(leadStatusSchema),
    defaultValues: {
      status: currentStatus,
      lostReason: currentLostReason ?? "",
    },
  });
  const status = useWatch({ control, name: "status" });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const response = await updateLeadStatusAction(leadId, values);
      setResult(response);
      if (response.ok) {
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormField id="status" label="Status" error={errors.status?.message}>
        <Select id="status" {...register("status")}>
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>{LEAD_STATUS_LABELS[value]}</option>
          ))}
        </Select>
      </FormField>
      {status === "lost" ? (
        <FormField id="lostReason" label="Lost reason" required error={errors.lostReason?.message}>
          <Textarea id="lostReason" {...register("lostReason")} />
        </FormField>
      ) : null}
      {result ? (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-success" : "text-sm text-error"}>
          {result.message}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Updating…" : "Update status"}
      </Button>
    </form>
  );
}
