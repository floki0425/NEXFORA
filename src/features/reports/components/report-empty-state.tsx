import { BarChart3, Lock } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

/** No rows matched the selected window. A normal outcome, not a failure. */
export function ReportEmptyState({ range }: { range?: string }) {
  return (
    <EmptyState
      icon={BarChart3}
      title="No data in this range"
      description={
        range
          ? `Nothing was recorded between ${range}. Try a wider date range.`
          : "Nothing was recorded in the selected range. Try a wider date range."
      }
    />
  );
}

/**
 * The database refused the caller. Reached only if someone bypasses the route
 * gate, since the RPC re-checks the role itself -- so it is stated plainly
 * rather than dressed up as a generic failure.
 */
export function ReportDeniedState() {
  return (
    <EmptyState
      icon={Lock}
      title="You don't have access to this report"
      description="Ask a workspace administrator if you need access."
    />
  );
}

/** Something went wrong loading the report. Details are logged server-side. */
export function ReportErrorState() {
  return (
    <ErrorState
      title="We couldn't load this report"
      description="Your data was not changed. Try again, or narrow the date range."
    />
  );
}
