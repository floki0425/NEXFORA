import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  phase: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: LucideIcon;
}

export function ModulePlaceholder({
  title,
  description,
  phase,
  emptyTitle,
  emptyDescription,
  icon,
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reserved module"
        title={title}
        description={description}
        action={<Badge>{phase}</Badge>}
      />
      <Card>
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
        />
      </Card>
    </div>
  );
}
