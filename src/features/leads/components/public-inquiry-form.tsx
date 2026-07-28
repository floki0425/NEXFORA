"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { submitProjectInquiryAction } from "../actions";
import {
  BUDGET_OPTIONS,
  REQUESTED_FEATURES,
  SERVICE_INTERESTS,
  TIMELINE_OPTIONS,
} from "../constants";
import {
  publicInquirySchema,
  type PublicInquiryInput,
} from "../schemas";
import type { ActionResult } from "../types";
import { FormField } from "./form-field";

const STEPS = [
  { title: "Service", description: "What would you like to build?" },
  { title: "Business", description: "Tell us about the organization." },
  { title: "Problem", description: "What should the project solve?" },
  { title: "Features", description: "Which capabilities matter most?" },
  { title: "Budget", description: "Choose an indicative investment range." },
  { title: "Timeline", description: "When would you like to get started?" },
  { title: "Contact", description: "How can our team reach you?" },
  { title: "Review", description: "Check your details before sending." },
] as const;

const STEP_FIELDS: (keyof PublicInquiryInput)[][] = [
  ["serviceInterest"],
  ["businessName", "industry"],
  ["problemSummary"],
  ["requestedFeatures"],
  ["budget"],
  ["targetTimeline"],
  ["fullName", "email", "phone"],
  [],
];

function OptionCard({
  children,
  checked,
}: {
  children: React.ReactNode;
  checked: boolean;
}) {
  return (
    <span
      className={`flex min-h-14 items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition ${
        checked
          ? "border-accent bg-accent-soft text-accent"
          : "border-border-strong bg-white text-foreground hover:border-accent/50"
      }`}
    >
      {children}
      {checked ? <Check className="size-4" aria-hidden="true" /> : null}
    </span>
  );
}

export function PublicInquiryForm() {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors },
  } = useForm<PublicInquiryInput>({
    resolver: zodResolver(publicInquirySchema),
    defaultValues: {
      fullName: "",
      businessName: "",
      email: "",
      phone: "",
      industry: "",
      serviceInterest: undefined,
      problemSummary: "",
      requestedFeatures: [],
      budget: "",
      targetTimeline: undefined,
      companyWebsite: "",
      startedAt,
    },
    mode: "onTouched",
  });
  const values = useWatch({ control });

  async function nextStep() {
    const valid = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (valid) {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }
  }

  const submit = handleSubmit((submitted) => {
    setResult(null);
    startTransition(async () => {
      const response = await submitProjectInquiryAction(submitted);
      setResult(response);
    });
  });

  if (result?.ok) {
    return (
      <section className="rounded-xl border border-success/20 bg-success-soft p-7 text-center sm:p-10" aria-live="polite">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-white">
          <Check className="size-6" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-foreground">Inquiry received</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-text-secondary">{result.message}</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-7">
        <div className="flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <span>Step {step + 1} of {STEPS.length}</span>
          <span>{STEPS[step].title}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">{STEPS[step].title}</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{STEPS[step].description}</p>
      </div>

      <div className="min-h-[20rem]">
        {step === 0 ? (
          <fieldset>
            <legend className="sr-only">Service interest</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SERVICE_INTERESTS.map((service) => (
                <label key={service} className="cursor-pointer">
                  <input type="radio" value={service} className="sr-only" {...register("serviceInterest")} />
                  <OptionCard checked={values.serviceInterest === service}>{service}</OptionCard>
                </label>
              ))}
            </div>
            {errors.serviceInterest ? <p className="mt-3 text-sm text-error" role="alert">{errors.serviceInterest.message}</p> : null}
          </fieldset>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            <FormField id="businessName" label="Business or organization name" error={errors.businessName?.message}>
              <Input id="businessName" autoComplete="organization" {...register("businessName")} />
            </FormField>
            <FormField id="industry" label="Industry" error={errors.industry?.message}>
              <Input id="industry" placeholder="e.g. Retail, professional services, healthcare" {...register("industry")} />
            </FormField>
          </div>
        ) : null}

        {step === 2 ? (
          <FormField id="problemSummary" label="Problem or opportunity" required error={errors.problemSummary?.message}>
            <Textarea
              id="problemSummary"
              className="min-h-52"
              placeholder="Describe what is happening today, who it affects, and what a successful outcome looks like."
              {...register("problemSummary")}
            />
          </FormField>
        ) : null}

        {step === 3 ? (
          <fieldset>
            <legend className="sr-only">Requested features</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {REQUESTED_FEATURES.map((feature) => (
                <label key={feature} className="cursor-pointer">
                  <input type="checkbox" value={feature} className="sr-only" {...register("requestedFeatures")} />
                  <OptionCard checked={values.requestedFeatures?.includes(feature) ?? false}>{feature}</OptionCard>
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm text-text-muted">Optional. Select all that apply.</p>
          </fieldset>
        ) : null}

        {step === 4 ? (
          <fieldset>
            <legend className="sr-only">Budget range</legend>
            <div className="space-y-3">
              {BUDGET_OPTIONS.map((option) => (
                <label key={option.label} className="block cursor-pointer">
                  <input type="radio" value={option.label} className="sr-only" {...register("budget")} />
                  <OptionCard checked={values.budget === option.label}>{option.label}</OptionCard>
                </label>
              ))}
            </div>
            {errors.budget ? <p className="mt-3 text-sm text-error" role="alert">{errors.budget.message}</p> : null}
          </fieldset>
        ) : null}

        {step === 5 ? (
          <fieldset>
            <legend className="sr-only">Target timeline</legend>
            <div className="space-y-3">
              {TIMELINE_OPTIONS.map((timeline) => (
                <label key={timeline} className="block cursor-pointer">
                  <input type="radio" value={timeline} className="sr-only" {...register("targetTimeline")} />
                  <OptionCard checked={values.targetTimeline === timeline}>{timeline}</OptionCard>
                </label>
              ))}
            </div>
            {errors.targetTimeline ? <p className="mt-3 text-sm text-error" role="alert">{errors.targetTimeline.message}</p> : null}
          </fieldset>
        ) : null}

        {step === 6 ? (
          <div className="space-y-5">
            <FormField id="fullName" label="Full name" required error={errors.fullName?.message}>
              <Input id="fullName" autoComplete="name" {...register("fullName")} />
            </FormField>
            <FormField id="email" label="Email address" required error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
            </FormField>
            <FormField id="phone" label="Phone number" error={errors.phone?.message}>
              <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
            </FormField>
          </div>
        ) : null}

        {step === 7 ? (
          <dl className="divide-y divide-border rounded-lg border border-border">
            {[
              ["Service", values.serviceInterest],
              ["Business", values.businessName || "Not provided"],
              ["Industry", values.industry || "Not provided"],
              ["Problem", values.problemSummary],
              ["Features", values.requestedFeatures?.join(", ") || "Not specified"],
              ["Budget", values.budget],
              ["Timeline", values.targetTimeline],
              ["Contact", `${values.fullName} · ${values.email}${values.phone ? ` · ${values.phone}` : ""}`],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
                <dd className="whitespace-pre-wrap text-sm leading-6 text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="absolute -left-[10000px] top-auto size-px overflow-hidden" aria-hidden="true">
          <label htmlFor="companyWebsite">Company website</label>
          <Input id="companyWebsite" tabIndex={-1} autoComplete="off" {...register("companyWebsite")} />
        </div>
        <input type="hidden" {...register("startedAt", { valueAsNumber: true })} />
      </div>

      {result && !result.ok ? (
        <p className="mt-5 rounded-md border border-error/20 bg-error-soft p-3 text-sm text-error" role="alert">
          {result.message}
        </p>
      ) : null}

      <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((current) => current - 1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : <span />}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={nextStep}>
            Continue
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending…" : "Send project inquiry"}
          </Button>
        )}
      </div>
    </form>
  );
}
