import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPortalProjects } from "@/features/portal/projects/queries";
import { PortalSupportActivityTimeline } from "@/features/portal/support/components/portal-support-activity-timeline";
import { PortalSupportResolutionActions } from "@/features/portal/support/components/portal-support-resolution-actions";
import { getPortalSupportTicket } from "@/features/portal/support/queries";
import { portalSupportTicketIdSchema } from "@/features/portal/support/schemas";
import {
  SUPPORT_TICKET_PRIORITY_BADGES,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUS_BADGES,
  SUPPORT_TICKET_STATUS_LABELS,
} from "@/features/support/constants";
import { formatSupportDate } from "@/features/support/format";
import { requirePortalMember } from "@/lib/auth/portal";

interface PortalSupportDetailPageProps {
  params: Promise<{ ticketId: string }>;
}

export const metadata: Metadata = {
  title: "Support request",
};

function DataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6 text-foreground">
        {children || "Not provided"}
      </dd>
    </div>
  );
}

export default async function PortalSupportDetailPage({
  params,
}: PortalSupportDetailPageProps) {
  const { ticketId } = await params;
  if (!portalSupportTicketIdSchema.safeParse(ticketId).success) {
    notFound();
  }

  const member = await requirePortalMember();
  const [ticket, projects] = await Promise.all([
    getPortalSupportTicket(ticketId),
    getPortalProjects(),
  ]);
  if (!ticket) {
    notFound();
  }

  const projectName = ticket.projectId
    ? projects.find((project) => project.id === ticket.projectId)?.name ?? null
    : null;
  const canRespond = member.role === "owner" || member.role === "manager";

  return (
    <div className="space-y-8">
      <Link
        href="/portal/support"
        className={buttonStyles({ variant: "ghost", size: "sm" })}
      >
        Back to support
      </Link>

      <PageHeader
        eyebrow={ticket.ticketNumber}
        title={ticket.title}
        description={projectName ?? "General support request"}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Request details</CardTitle>
                <Badge
                  data-testid="portal-support-status-badge"
                  variant={SUPPORT_TICKET_STATUS_BADGES[ticket.status]}
                >
                  {SUPPORT_TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
                <Badge
                  variant={SUPPORT_TICKET_PRIORITY_BADGES[ticket.priority]}
                >
                  {SUPPORT_TICKET_PRIORITY_LABELS[ticket.priority]} priority
                </Badge>
              </div>
              <CardDescription>
                Sent {formatSupportDate(ticket.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Project">
                  {projectName ?? "General support"}
                </DataItem>
                <DataItem label="Category">{ticket.category}</DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="What you reported">
                    <span className="whitespace-pre-wrap">
                      {ticket.description}
                    </span>
                  </DataItem>
                </div>
              </dl>
            </CardContent>
          </Card>

          {ticket.resolutionNote ? (
            <Card className="border-success/20 bg-success-soft">
              <CardHeader>
                <CardTitle>Resolution from Nexfora</CardTitle>
                <CardDescription>
                  Review the fix and tell us whether everything now works.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {ticket.resolutionNote}
                </p>
                {ticket.status === "resolved" && canRespond ? (
                  <PortalSupportResolutionActions ticketId={ticket.id} />
                ) : null}
                {ticket.status === "resolved" && !canRespond ? (
                  <p className="text-sm text-text-muted">
                    A client owner or manager can confirm the resolution or
                    report that the issue remains.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Updates</CardTitle>
              <CardDescription>
                A clear history of progress on this request.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalSupportActivityTimeline activities={ticket.activities} />
            </CardContent>
          </Card>
        </div>

        <aside>
          <Card>
            <CardHeader>
              <CardTitle>Current status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Badge variant={SUPPORT_TICKET_STATUS_BADGES[ticket.status]}>
                {SUPPORT_TICKET_STATUS_LABELS[ticket.status]}
              </Badge>
              <p className="text-sm leading-6 text-text-secondary">
                {ticket.status === "waiting_for_client"
                  ? "The Nexfora team needs information or action from you."
                  : ticket.status === "resolved"
                    ? "The team marked this issue resolved. Please review the resolution."
                    : ticket.status === "closed"
                      ? "This request is closed. Its full history remains available."
                      : "The Nexfora team is reviewing or working on this request."}
              </p>
              <DataItem label="Last updated">
                {formatSupportDate(ticket.updatedAt)}
              </DataItem>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
