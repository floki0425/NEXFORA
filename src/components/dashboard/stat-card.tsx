import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
}

export function StatCard({
  label,
  value,
  description,
  icon: Icon,
}: StatCardProps) {
  return (
    <Card className="h-full">
      <CardContent>
        <dl>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm font-medium text-text-secondary">
              {label}
            </dt>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-secondary">
              <Icon className="size-[1.125rem]" aria-hidden="true" />
            </span>
          </div>
          <dd className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-foreground">
            {value}
          </dd>
        </dl>
        <p className="mt-2 text-xs leading-5 text-text-muted">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
