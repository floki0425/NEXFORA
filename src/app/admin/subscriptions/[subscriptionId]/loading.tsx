import { Skeleton } from "@/components/ui/skeleton";

export default function SubscriptionDetailLoading() {
  return (
    <div
      className="space-y-7"
      aria-label="Loading maintenance subscription"
      aria-busy="true"
    >
      <Skeleton className="h-5 w-32" />
      <div>
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[42rem] w-full rounded-lg" />
        <Skeleton className="h-[34rem] w-full rounded-lg" />
      </div>
    </div>
  );
}
