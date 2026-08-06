import { Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { requireAdminSearchAccess } from "@/lib/auth/reports-access";
import { SEARCH_MIN_QUERY_LENGTH } from "@/lib/search/sanitize";

import { SearchResultList } from "@/features/search/components/search-result-list";
import { searchWorkspace } from "@/features/search/queries";

export const dynamic = "force-dynamic";

// Server-rendered route fallback for the ⌘K palette: a directly addressable,
// bookmarkable, refreshable URL for a search, and a stable target for browser
// tests. All state lives in `?q=`, so a view is shareable and the Back button
// works. Uses the same query layer as the dialog, so authorization and error
// semantics are identical.
//
// This route does NOT work with scripting disabled, and is not claimed to.
// The authenticated admin application requires JavaScript: the App Router
// loading.tsx boundaries the admin shell has used since Phase 2 make Next.js
// stream Suspense content into a <template> that an inline script relocates.
// See docs/PHASE_12A_REPORTING_SEARCH_SETUP.md → "Platform requirement".

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSearchAccess();

  const params = await searchParams;
  const raw = params.q;
  const query = (Array.isArray(raw) ? raw[0] : raw) ?? "";

  const result = query.trim().length > 0 ? await searchWorkspace(query) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Find leads, clients, projects, proposals, invoices and support tickets."
      />

      <Card className="p-4 sm:p-5">
        <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-text-secondary">
              Search term
            </span>
            <Input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Name, number or title"
              autoComplete="off"
            />
          </label>
          <button type="submit" className={buttonStyles({ variant: "secondary" })}>
            Search
          </button>
        </form>
        <p className="mt-3 text-xs text-text-muted">
          Enter at least {SEARCH_MIN_QUERY_LENGTH} characters. Results are limited to
          what your role may see.
        </p>
      </Card>

      {result === null ? (
        <EmptyState
          icon={Search}
          title="Search the workspace"
          description="Enter a term above to find records you have access to."
        />
      ) : null}

      {result?.status === "ok" ? (
        <Card className="p-3">
          <SearchResultList results={result.results} />
        </Card>
      ) : null}

      {result?.status === "empty" ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description={`Nothing matched “${query.trim()}”. Try a different term.`}
        />
      ) : null}

      {result?.status === "denied" ? (
        <EmptyState
          icon={Search}
          title="You don't have access to workspace search"
          description="Ask a workspace administrator if you need access."
        />
      ) : null}

      {result?.status === "error" ? (
        <ErrorState
          title="We couldn't run that search"
          description="Nothing was changed. Try again in a moment."
        />
      ) : null}
    </div>
  );
}
