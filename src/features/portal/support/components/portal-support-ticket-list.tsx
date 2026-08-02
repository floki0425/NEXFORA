import { LifeBuoy } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  SUPPORT_TICKET_PRIORITY_BADGES,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUS_BADGES,
  SUPPORT_TICKET_STATUS_LABELS,
} from "@/features/support/constants";
import { formatSupportDate } from "@/features/support/format";

import type { PortalSupportTicket } from "../types";

interface PortalSupportTicketListProps {
  tickets: PortalSupportTicket[];
  projectNames: Record<string, string>;
}

export function PortalSupportTicketList({
  tickets,
  projectNames,
}: PortalSupportTicketListProps) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title="No support requests yet"
        description="When you ask Nexfora for help, your requests and their progress will appear here."
      />
    );
  }

  return (
    <div className="divide-y divide-border">
      {tickets.map((ticket) => (
        <Link
          key={ticket.id}
          href={`/portal/support/${ticket.id}`}
          data-testid="portal-support-ticket-row"
          data-ticket-number={ticket.ticketNumber}
          className="block py-5 first:pt-0 last:pb-0 hover:bg-surface-muted/60 sm:px-2"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {ticket.ticketNumber}
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {ticket.title}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {ticket.projectId
                  ? (projectNames[ticket.projectId] ?? "Linked project")
                  : "General support"}
                {" - Updated "}
                {formatSupportDate(ticket.updatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={SUPPORT_TICKET_PRIORITY_BADGES[ticket.priority]}>
                {SUPPORT_TICKET_PRIORITY_LABELS[ticket.priority]}
              </Badge>
              <Badge variant={SUPPORT_TICKET_STATUS_BADGES[ticket.status]}>
                {SUPPORT_TICKET_STATUS_LABELS[ticket.status]}
              </Badge>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
