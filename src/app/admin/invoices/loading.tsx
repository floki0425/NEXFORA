import { Skeleton } from "@/components/ui/skeleton";

export default function InvoicesLoading() {
  return (
    <div className="space-y-7" aria-label="Loading invoices" aria-busy="true">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
