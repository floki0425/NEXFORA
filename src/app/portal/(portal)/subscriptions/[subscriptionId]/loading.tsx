import { Skeleton } from "@/components/ui/skeleton";

export default function PortalSubscriptionDetailLoading() {
  return (
    <div
      className="space-y-8"
      aria-label="Loading maintenance plan"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-32" />
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
