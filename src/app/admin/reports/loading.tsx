import { Skeleton } from "@/components/ui/skeleton";

export default function ReportsIndexLoading() {
  return (
    <div className="space-y-6" aria-label="Loading Reports" aria-busy="true">
      <div>
        <Skeleton className="mt-3 h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
