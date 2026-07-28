import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div
      role="status"
      aria-label="Loading admin workspace"
      className="space-y-8"
    >
      <span className="sr-only">Loading admin workspace…</span>

      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="size-9" />
              </div>
              <Skeleton className="mt-5 h-9 w-16" />
              <Skeleton className="mt-3 h-3 w-40 max-w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index}>
            <CardContent className="min-h-44">
              <div className="flex items-start justify-between gap-4">
                <Skeleton className="size-10" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-5 h-5 w-32" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
