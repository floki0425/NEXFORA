import { formatRevisionDate } from "../format";
import type { RevisionActivityItem } from "../types";

interface RevisionActivityTimelineProps {
  activities: RevisionActivityItem[];
}

export function RevisionActivityTimeline({
  activities,
}: RevisionActivityTimelineProps) {
  if (activities.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {activities.map((activity, index) => (
        <li key={`${activity.created_at}-${index}`} className="text-sm">
          <p className="font-medium text-foreground">{activity.title}</p>
          {activity.description ? (
            <p className="mt-1 whitespace-pre-wrap text-text-secondary">
              {activity.description}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-text-muted">
            {activity.actorName ?? "System"} ·{" "}
            {formatRevisionDate(activity.created_at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
