import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <div className="space-y-7" aria-label="Loading clients" aria-busy="true">
      <div>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-9 w-44" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
