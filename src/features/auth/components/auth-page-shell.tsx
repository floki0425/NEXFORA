import Link from "next/link";
import type { ReactNode } from "react";

interface AuthPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: AuthPageShellProps) {
  return (
    <main className="grid min-h-svh bg-surface-muted lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.72fr)]">
      <section className="hidden bg-surface-dark px-12 py-16 text-text-on-dark lg:flex lg:flex-col lg:justify-between">
        <Link
          href="/"
          className="w-fit text-sm font-semibold uppercase tracking-[0.28em] text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          Nexfora
        </Link>
        <div className="max-w-xl space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
            NEXFORA OS
          </p>
          <h2 className="text-5xl font-semibold leading-tight tracking-[-0.035em]">
            One secure workspace for Nexfora operations.
          </h2>
          <p className="max-w-lg text-lg leading-8 text-nexfora-gray-200">
            Internal access is limited to authorized members of Nexfora
            Digital Innovation.
          </p>
        </div>
        <p className="text-sm text-text-muted">
          Technology built for what&apos;s next.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-12 inline-block text-sm font-semibold uppercase tracking-[0.28em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent lg:hidden"
          >
            Nexfora
          </Link>

          <div className="mb-8 space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
              {eyebrow}
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-foreground">
              {title}
            </h1>
            <p className="leading-7 text-text-secondary">{description}</p>
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
