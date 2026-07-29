import type { Metadata } from "next";
import Link from "next/link";

import { CostEstimatorForm } from "@/features/estimator/components/cost-estimator-form";

export const metadata: Metadata = {
  title: "Estimate your project | Nexfora",
  description:
    "Get a non-final indicative cost range for your website, application, or system.",
};

export default function EstimatePage() {
  return (
    <main className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            NEXFORA
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Digital Innovation</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,0.75fr)_minmax(34rem,1.25fr)] lg:items-start">
        <section className="lg:sticky lg:top-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Estimate</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
            See an indicative range in minutes.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-text-secondary">
            Choose a project type, the features that matter, and a few
            details. This is not a final quotation — Nexfora will follow up
            after discovery and scope validation.
          </p>
          <p className="mt-6 text-sm leading-6 text-text-muted">
            Prefer to just tell us about your project?{" "}
            <Link href="/start-a-project" className="font-medium text-accent hover:underline">
              Start a project instead
            </Link>
            .
          </p>
        </section>
        <section
          className="rounded-xl border border-border bg-white p-5 shadow-sm sm:p-8"
          aria-label="Cost estimator"
        >
          <CostEstimatorForm />
        </section>
      </div>
    </main>
  );
}
