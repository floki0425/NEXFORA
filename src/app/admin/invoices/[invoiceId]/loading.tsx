import { Skeleton } from "@/components/ui/skeleton";

export default function InvoiceDetailLoading() {
  return (
    <div className="space-y-7" aria-label="Loading invoice" aria-busy="true">
      <Skeleton className="h-5 w-28" />
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Skeleton className="h-[34rem] w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  );
}
