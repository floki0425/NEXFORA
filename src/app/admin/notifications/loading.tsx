import { Skeleton } from "@/components/ui/skeleton";

export default function AdminNotificationsLoading() {
  return (
    <div
      className="space-y-7"
      aria-label="Loading notifications"
      aria-busy="true"
    >
      <div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-3 h-9 w-44" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
