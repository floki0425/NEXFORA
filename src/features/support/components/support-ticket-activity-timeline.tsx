import { formatSupportDate } from "../format";
import type { SupportTicketActivity } from "../types";

interface SupportTicketActivityTimelineProps {
  activities: SupportTicketActivity[];
}

export function SupportTicketActivityTimeline({
  activities,
}: SupportTicketActivityTimelineProps) {
  if (activities.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet.</p>;
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
            {activity.actorName ?? "System"} - {formatSupportDate(activity.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
