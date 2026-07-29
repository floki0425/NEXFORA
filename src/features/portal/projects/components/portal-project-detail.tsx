import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MILESTONE_STATUS_BADGES,
  MILESTONE_STATUS_LABELS,
  PROJECT_PRIORITY_BADGES,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_BADGES,
  PROJECT_STATUS_LABELS,
} from "@/features/projects/constants";
import { formatProjectDay } from "@/features/projects/format";

import type { PortalProjectDetail as PortalProjectDetailData } from "../types";

interface PortalProjectDetailProps {
  project: PortalProjectDetailData;
}

export function PortalProjectDetail({ project }: PortalProjectDetailProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{project.name}</CardTitle>
            <Badge variant={PROJECT_STATUS_BADGES[project.status]}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            <Badge variant={PROJECT_PRIORITY_BADGES[project.priority]}>
              {PROJECT_PRIORITY_LABELS[project.priority]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {project.description ? (
            <p className="whitespace-pre-wrap text-sm leading-7 text-text-secondary">
              {project.description}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Progress</span>
              <span>{project.progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${Math.min(100, Math.max(0, project.progressPercent))}%`,
                }}
              />
            </div>
          </div>

          <dl className="grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Start date
              </dt>
              <dd className="mt-1.5 text-sm text-foreground">
                {formatProjectDay(project.startDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Target date
              </dt>
              <dd className="mt-1.5 text-sm text-foreground">
                {formatProjectDay(project.targetDate)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          {project.milestones.length ? (
            <ul className="space-y-3">
              {project.milestones.map((milestone) => (
                <li
                  key={milestone.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">
                      {milestone.title}
                    </p>
                    <Badge variant={MILESTONE_STATUS_BADGES[milestone.status]}>
                      {MILESTONE_STATUS_LABELS[milestone.status]}
                    </Badge>
                  </div>
                  {milestone.description ? (
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {milestone.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-text-muted">
                    Due {formatProjectDay(milestone.dueDate)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">
              No milestones have been added to this project yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
