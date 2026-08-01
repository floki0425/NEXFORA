import { formatSupportDate } from "@/features/support/format";

import type { PortalSupportActivity } from "../types";

export function PortalSupportActivityTimeline({
  activities,
}: {
  activities: PortalSupportActivity[];
}) {
  if (activities.length === 0) {
    return <p className="text-sm text-text-muted">No updates yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {activities.map((activity, index) => (
        <li key={`${activity.createdAt}-${index}`} className="text-sm">
          <p className="font-medium text-foreground">{activity.title}</p>
          {activity.description ? (
            <p className="mt-1 whitespace-pre-wrap text-text-secondary">
              {activity.description}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-text-muted">
            {formatSupportDate(activity.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
