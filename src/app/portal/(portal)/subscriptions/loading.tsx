import { Skeleton } from "@/components/ui/skeleton";

export default function PortalSubscriptionsLoading() {
  return (
    <div
      className="space-y-8"
      aria-label="Loading maintenance plans"
      aria-busy="true"
    >
      <div>
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
