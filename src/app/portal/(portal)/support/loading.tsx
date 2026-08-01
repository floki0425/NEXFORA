import { Skeleton } from "@/components/ui/skeleton";

export default function PortalSupportLoading() {
  return (
    <div className="space-y-8" aria-label="Loading support" aria-busy="true">
      <div>
        <Skeleton className="h-9 w-44" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
