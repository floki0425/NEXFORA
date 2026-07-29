"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  REQUESTED_FEATURES,
  SERVICE_INTERESTS,
  TIMELINE_OPTIONS,
} from "../../leads/constants.ts";
import type { ActionResult } from "@/features/leads/types";

import {
  estimateProjectCostAction,
  submitEstimatorLeadAction,
} from "../actions";
import type { EstimateRange } from "../pricing";
import {
  estimatorLeadCaptureSchema,
  type EstimatorLeadCaptureInput,
} from "../schemas";

const STEPS = [
  { title: "Project type", description: "What are you looking to build?" },
  { title: "Features", description: "Which capabilities matter most?" },
  { title: "Details", description: "Tell us more about the project." },
  { title: "Estimate", description: "A non-final indicative range." },
  { title: "Contact", description: "Where should Nexfora follow up?" },
] as const;

const STEP_FIELDS: (keyof EstimatorLeadCaptureInput)[][] = [
  ["projectType"],
  ["features"],
  ["details"],
  [],
  ["fullName", "email", "phone", "targetTimeline"],
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

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

export function CostEstimatorForm() {
  const [step, setStep] = useState(0);
  const [estimate, setEstimate] = useState<EstimateRange | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors },
  } = useForm<EstimatorLeadCaptureInput>({
    resolver: zodResolver(estimatorLeadCaptureSchema),
    defaultValues: {
      projectType: undefined,
      features: [],
      details: "",
      fullName: "",
      businessName: "",
      email: "",
      phone: "",
      targetTimeline: undefined,
      companyWebsite: "",
      startedAt,
    },
    mode: "onTouched",
  });
  const values = useWatch({ control });

  useEffect(() => {
    if (step !== 3 || !values.projectType) {
      return;
    }

    let cancelled = false;
    void estimateProjectCostAction({
      projectType: values.projectType,
      features: values.features ?? [],
    }).then((response) => {
      if (!cancelled && response.ok) {
        setEstimate(response.range);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function nextStep() {
    const valid = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (valid) {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }
  }

  const submit = handleSubmit((submitted) => {
    setResult(null);
    startTransition(async () => {
      const response = await submitEstimatorLeadAction(submitted);
      setResult(response);
    });
  });

  if (result?.ok) {
    return (
      <section
        className="rounded-xl border border-success/20 bg-success-soft p-7 text-center sm:p-10"
        aria-live="polite"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-white">
          <Check className="size-6" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-foreground">Estimate request received</h2>
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

      <div className="min-h-[18rem]">
        {step === 0 ? (
          <fieldset>
            <legend className="sr-only">Project type</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SERVICE_INTERESTS.map((service) => (
                <label key={service} className="cursor-pointer">
                  <input type="radio" value={service} className="sr-only" {...register("projectType")} />
                  <OptionCard checked={values.projectType === service}>{service}</OptionCard>
                </label>
              ))}
            </div>
            {errors.projectType ? (
              <p className="mt-3 text-sm text-error" role="alert">{errors.projectType.message}</p>
            ) : null}
          </fieldset>
        ) : null}

        {step === 1 ? (
          <fieldset>
            <legend className="sr-only">Requested features</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {REQUESTED_FEATURES.map((feature) => (
                <label key={feature} className="cursor-pointer">
                  <input type="checkbox" value={feature} className="sr-only" {...register("features")} />
                  <OptionCard checked={values.features?.includes(feature) ?? false}>{feature}</OptionCard>
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm text-text-muted">Optional. Select all that apply.</p>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <FormField id="details" label="Project details" required error={errors.details?.message}>
            <Textarea
              id="details"
              className="min-h-52"
              placeholder="Describe what you're trying to build and the problem it solves."
              {...register("details")}
            />
          </FormField>
        ) : null}

        {step === 3 ? (
          <div className="rounded-xl border border-border bg-surface-muted p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Non-final estimate</p>
            {estimate ? (
              <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                {formatCurrency(estimate.min)} – {formatCurrency(estimate.max)}
              </p>
            ) : (
              <p className="mt-3 text-sm text-text-muted">Calculating your estimate…</p>
            )}
            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-text-secondary">
              This is an indicative range only, not a final quotation. Actual
              pricing depends on discovery and scope validation.
            </p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-5">
            <FormField id="fullName" label="Full name" required error={errors.fullName?.message}>
              <Input id="fullName" autoComplete="name" {...register("fullName")} />
            </FormField>
            <FormField id="businessName" label="Business name" error={errors.businessName?.message}>
              <Input id="businessName" autoComplete="organization" {...register("businessName")} />
            </FormField>
            <FormField id="email" label="Email address" required error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
            </FormField>
            <FormField id="phone" label="Phone number" error={errors.phone?.message}>
              <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
            </FormField>
            <FormField id="targetTimeline" label="Timeline" required error={errors.targetTimeline?.message}>
              <select
                id="targetTimeline"
                className="min-h-11 w-full rounded-md border border-border-strong bg-white px-3.5 text-base text-foreground outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/15"
                {...register("targetTimeline")}
              >
                <option value="">Select a timeline</option>
                {TIMELINE_OPTIONS.map((timeline) => (
                  <option key={timeline} value={timeline}>{timeline}</option>
                ))}
              </select>
            </FormField>
          </div>
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
            {isPending ? "Sending…" : "Get in touch"}
          </Button>
        )}
      </div>
    </form>
  );
}
