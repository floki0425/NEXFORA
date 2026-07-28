import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Client Portal | Nexfora",
  description: "The Nexfora Client Portal is not available yet.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PortalPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-surface-muted px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">
        Nexfora
      </p>
      <h1 className="text-4xl font-semibold tracking-[-0.03em] text-foreground">
        Client Portal
      </h1>
      <p className="max-w-md leading-7 text-text-secondary">
        The client portal is not available in Phase 1. No client data or
        portal functionality is exposed here.
      </p>
      <Link
        href="/"
        className="mt-2 min-h-11 rounded-md border border-border-strong bg-white px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Return to Nexfora
      </Link>
    </main>
  );
}
