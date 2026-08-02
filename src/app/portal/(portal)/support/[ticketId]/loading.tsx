import { Skeleton } from "@/components/ui/skeleton";

export default function PortalSupportDetailLoading() {
  return (
    <div
      className="space-y-8"
      aria-label="Loading support request"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-28" />
      <div>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}
