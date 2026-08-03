import { Skeleton } from "@/components/ui/skeleton";

export default function AdminNotificationPreferencesLoading() {
  return (
    <div
      className="space-y-7"
      aria-label="Loading notification preferences"
      aria-busy="true"
    >
      <div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-3 h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
