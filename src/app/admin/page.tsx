interface AdminPageProps {
  searchParams: Promise<{
    notice?: string | string[];
  }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const notice = Array.isArray(params.notice)
    ? params.notice[0]
    : params.notice;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
      <section className="w-full max-w-3xl">
        {notice === "logout_failed" ? (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning"
          >
            We couldn&apos;t sign you out. Please try again.
          </div>
        ) : null}

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Phase 1
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-foreground">
          Access verified
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-text-secondary">
          Authentication, internal membership, server authorization, and
          database RLS form the current workspace foundation. Operational
          modules remain intentionally unavailable until later phases.
        </p>

        <div className="mt-10 rounded-xl border border-border bg-white p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-foreground">
            Phase 1 boundary
          </h2>
          <p className="mt-2 leading-7 text-text-secondary">
            Leads, CRM, clients, projects, proposals, invoices, payments,
            portal functionality, and AI have not been enabled.
          </p>
        </div>
      </section>
    </main>
  );
}
