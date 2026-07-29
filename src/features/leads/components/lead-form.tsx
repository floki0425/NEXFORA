"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createLeadAction, updateLeadAction } from "../actions";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from "../constants";
import {
  leadFormSchema,
  type LeadFormInput,
} from "../schemas";
import type { ActionResult, LeadDetail, MemberOption } from "../types";

interface LeadFormProps {
  members: MemberOption[];
  lead?: LeadDetail;
}

function defaultsFromLead(lead?: LeadDetail): LeadFormInput {
  return {
    fullName: lead?.full_name ?? "",
    businessName: lead?.business_name ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    industry: lead?.industry ?? "",
    serviceInterest: lead?.service_interest ?? "",
    problemSummary: lead?.problem_summary ?? "",
    requestedFeatures: Array.isArray(lead?.requested_features)
      ? lead.requested_features.filter((item): item is string => typeof item === "string").join(", ")
      : "",
    budgetMin: lead?.budget_min?.toString() ?? "",
    budgetMax: lead?.budget_max?.toString() ?? "",
    targetTimeline: lead?.target_timeline ?? "",
    source: lead?.source ?? "manual",
    sourceDetail: lead?.source_detail ?? "",
    leadScore: lead?.lead_score?.toString() ?? "",
    assignedTo: lead?.assigned_to ?? "",
  };
}

export function LeadForm({ members, lead }: LeadFormProps) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: defaultsFromLead(lead),
  });

  const submit = handleSubmit((values) => {
    setResult(null);
    startTransition(async () => {
      const response = lead
        ? await updateLeadAction(lead.id, values)
        : await createLeadAction(values);

      if (response?.fieldErrors) {
        for (const [field, messages] of Object.entries(response.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            setError(field as keyof LeadFormInput, { message });
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
          <CardTitle>Contact and business</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField id="fullName" label="Full name" required error={errors.fullName?.message}>
            <Input id="fullName" autoComplete="name" aria-invalid={Boolean(errors.fullName)} {...register("fullName")} />
          </FormField>
          <FormField id="businessName" label="Business name" error={errors.businessName?.message}>
            <Input id="businessName" autoComplete="organization" aria-invalid={Boolean(errors.businessName)} {...register("businessName")} />
          </FormField>
          <FormField id="email" label="Email" required error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />
          </FormField>
          <FormField id="phone" label="Phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" autoComplete="tel" aria-invalid={Boolean(errors.phone)} {...register("phone")} />
          </FormField>
          <FormField id="industry" label="Industry" error={errors.industry?.message}>
            <Input id="industry" aria-invalid={Boolean(errors.industry)} {...register("industry")} />
          </FormField>
          <FormField id="serviceInterest" label="Service interest" required error={errors.serviceInterest?.message}>
            <Input id="serviceInterest" aria-invalid={Boolean(errors.serviceInterest)} {...register("serviceInterest")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project scope</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField id="problemSummary" label="Problem summary" error={errors.problemSummary?.message}>
              <Textarea id="problemSummary" aria-invalid={Boolean(errors.problemSummary)} {...register("problemSummary")} />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField
              id="requestedFeatures"
              label="Requested features"
              hint="Separate features with commas."
              error={errors.requestedFeatures?.message}
            >
              <Textarea id="requestedFeatures" aria-invalid={Boolean(errors.requestedFeatures)} {...register("requestedFeatures")} />
            </FormField>
          </div>
          <FormField id="budgetMin" label="Minimum budget (PHP)" error={errors.budgetMin?.message}>
            <Input id="budgetMin" inputMode="decimal" aria-invalid={Boolean(errors.budgetMin)} {...register("budgetMin")} />
          </FormField>
          <FormField id="budgetMax" label="Maximum budget (PHP)" error={errors.budgetMax?.message}>
            <Input id="budgetMax" inputMode="decimal" aria-invalid={Boolean(errors.budgetMax)} {...register("budgetMax")} />
          </FormField>
          <FormField id="targetTimeline" label="Target timeline" error={errors.targetTimeline?.message}>
            <Input id="targetTimeline" aria-invalid={Boolean(errors.targetTimeline)} {...register("targetTimeline")} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CRM details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <FormField id="source" label="Source" required error={errors.source?.message}>
            <Select id="source" aria-invalid={Boolean(errors.source)} {...register("source")}>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</option>
              ))}
            </Select>
          </FormField>
          <FormField id="sourceDetail" label="Source detail" error={errors.sourceDetail?.message}>
            <Input id="sourceDetail" aria-invalid={Boolean(errors.sourceDetail)} {...register("sourceDetail")} />
          </FormField>
          <FormField id="leadScore" label="Lead score" hint="Optional, from 0 to 100." error={errors.leadScore?.message}>
            <Input id="leadScore" inputMode="numeric" aria-invalid={Boolean(errors.leadScore)} {...register("leadScore")} />
          </FormField>
          <FormField id="assignedTo" label="Assignee" error={errors.assignedTo?.message}>
            <Select id="assignedTo" aria-invalid={Boolean(errors.assignedTo)} {...register("assignedTo")}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.fullName}</option>
              ))}
            </Select>
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

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href={lead ? `/admin/leads/${lead.id}` : "/admin/leads"}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-strong bg-white px-4 text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : lead ? "Save changes" : "Create lead"}
        </Button>
      </div>
    </form>
  );
}
