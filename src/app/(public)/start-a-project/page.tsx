import type { Metadata } from "next";
import Link from "next/link";

import { PublicInquiryForm } from "@/features/leads/components/public-inquiry-form";

export const metadata: Metadata = {
  title: "Start a project | Nexfora",
  description: "Tell Nexfora about the digital product, system, or website your business needs.",
};

export default function StartAProjectPage() {
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Start a project</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
            Let&apos;s understand what your business needs.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-text-secondary">
            Share the problem, priorities, budget, and timing. This guided form usually takes five minutes.
          </p>
          <p className="mt-6 text-sm leading-6 text-text-muted">
            Your information is used only to evaluate and respond to this project inquiry.
          </p>
        </section>
        <section className="rounded-xl border border-border bg-white p-5 shadow-sm sm:p-8" aria-label="Project inquiry form">
          <PublicInquiryForm />
        </section>
      </div>
    </main>
  );
}
