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
import { Textarea } from "@/components/ui/textarea";

import { updateProposalAction } from "../actions";
import { proposalEditSchema, type ProposalEditInput } from "../schemas";
import type { ProposalActionResult, ProposalDetail } from "../types";

function deliverablesToText(deliverables: unknown): string {
  return Array.isArray(deliverables)
    ? deliverables.filter((value): value is string => typeof value === "string").join(", ")
    : "";
}

function defaultsFromProposal(proposal: ProposalDetail): ProposalEditInput {
  return {
    title: proposal.title,
    summary: proposal.summary ?? "",
    scope: proposal.scope ?? "",
    deliverables: deliverablesToText(proposal.deliverables),
    timelineText: proposal.timeline_text ?? "",
    paymentTermsText: proposal.payment_terms_text ?? "",
    termsText: proposal.terms_text ?? "",
    validUntil: proposal.valid_until ?? "",
    discount: String(proposal.discount),
    tax: String(proposal.tax),
  };
}

export function ProposalEditForm({ proposal }: { proposal: ProposalDetail }) {
  const [result, setResult] = useState<ProposalActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProposalEditInput>({
    resolver: zodResolver(proposalEditSchema),
    defaultValues: defaultsFromProposal(proposal),
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = await updateProposalAction(proposal.id, values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(
          response.fieldErrors,
        )) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof ProposalEditInput, { message });
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
          <CardTitle>Proposal content</CardTitle>
          <CardDescription>
            Lead: {proposal.leadName ?? "Not linked"}. The lead relationship is
            set at creation and cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField id="title" label="Project title" required error={errors.title?.message}>
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
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
