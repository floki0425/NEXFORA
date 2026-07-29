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

import { createProposalAction } from "../actions";
import { proposalCreateSchema, type ProposalCreateInput } from "../schemas";
import type { ProposalActionResult } from "../types";

interface ProposalCreateFormProps {
  leads: { id: string; label: string }[];
  defaultLeadId?: string;
}

export function ProposalCreateForm({
  leads,
  defaultLeadId,
}: ProposalCreateFormProps) {
  const [result, setResult] = useState<ProposalActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProposalCreateInput>({
    resolver: zodResolver(proposalCreateSchema),
    defaultValues: {
      leadId: defaultLeadId ?? "",
      title: "",
      summary: "",
      scope: "",
      deliverables: "",
      timelineText: "",
      paymentTermsText: "",
      termsText: "",
      validUntil: "",
      discount: "0",
      tax: "0",
    },
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await createProposalAction(values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(
          response.fieldErrors,
        )) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof ProposalCreateInput, { message });
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
          <CardTitle>Proposal basics</CardTitle>
          <CardDescription>
            Every proposal starts from a qualified lead. Line items, payment
            terms, and sending happen after the draft is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField
              id="leadId"
              label="Qualified lead"
              required
              error={errors.leadId?.message}
            >
              <Select id="leadId" aria-invalid={Boolean(errors.leadId)} {...register("leadId")}>
                <option value="">Select a qualified lead</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField
              id="title"
              label="Project title"
              required
              error={errors.title?.message}
            >
              <Input id="title" aria-invalid={Boolean(errors.title)} {...register("title")} />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField id="summary" label="Overview" error={errors.summary?.message}>
              <Textarea id="summary" {...register("summary")} />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField id="scope" label="Scope and solution" error={errors.scope?.message}>
              <Textarea id="scope" {...register("scope")} />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField
              id="deliverables"
              label="Deliverables"
              hint="Separate deliverables with commas."
              error={errors.deliverables?.message}
            >
              <Textarea id="deliverables" {...register("deliverables")} />
            </FormField>
          </div>
          <FormField id="timelineText" label="Timeline" error={errors.timelineText?.message}>
            <Textarea id="timelineText" {...register("timelineText")} />
          </FormField>
          <FormField id="validUntil" label="Valid until" error={errors.validUntil?.message}>
            <Input id="validUntil" type="date" {...register("validUntil")} />
          </FormField>
          <div className="md:col-span-2">
            <FormField
              id="paymentTermsText"
              label="Payment terms"
              error={errors.paymentTermsText?.message}
            >
              <Textarea id="paymentTermsText" {...register("paymentTermsText")} />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField id="termsText" label="Terms and conditions" error={errors.termsText?.message}>
              <Textarea id="termsText" {...register("termsText")} />
            </FormField>
          </div>
          <FormField id="discount" label="Discount (PHP)" error={errors.discount?.message}>
            <Input id="discount" inputMode="decimal" {...register("discount")} />
          </FormField>
          <FormField id="tax" label="Tax (PHP)" error={errors.tax?.message}>
            <Input id="tax" inputMode="decimal" {...register("tax")} />
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
          {isPending ? "Creating…" : "Create draft proposal"}
        </Button>
      </div>
    </form>
  );
}
