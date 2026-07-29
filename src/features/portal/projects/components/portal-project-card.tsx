import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  PROJECT_PRIORITY_BADGES,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_BADGES,
  PROJECT_STATUS_LABELS,
} from "@/features/projects/constants";
import { formatProjectDay } from "@/features/projects/format";

import type { PortalProjectListItem } from "../types";

interface PortalProjectCardProps {
  project: PortalProjectListItem;
}

export function PortalProjectCard({ project }: PortalProjectCardProps) {
  return (
    <Link
      href={`/portal/projects/${project.id}`}
      className="block rounded-lg border border-border bg-white p-4 transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-foreground">{project.name}</p>
        <div className="flex gap-2">
          <Badge variant={PROJECT_STATUS_BADGES[project.status]}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
          <Badge variant={PROJECT_PRIORITY_BADGES[project.priority]}>
            {PROJECT_PRIORITY_LABELS[project.priority]}
          </Badge>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Progress</span>
          <span>{project.progressPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, project.progressPercent))}%` }}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-text-muted">
        Target date: {formatProjectDay(project.targetDate)}
      </p>
    </Link>
  );
}
