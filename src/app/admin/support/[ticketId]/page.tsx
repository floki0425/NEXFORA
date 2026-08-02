import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportTicketActivityTimeline } from "@/features/support/components/support-ticket-activity-timeline";
import { SupportTicketAssignForm } from "@/features/support/components/support-ticket-assign-form";
import { SupportTicketStatusForm } from "@/features/support/components/support-ticket-status-form";
import {
  SUPPORT_TICKET_ADMIN_STATUS_LABELS,
  SUPPORT_TICKET_PRIORITY_BADGES,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUS_BADGES,
} from "@/features/support/constants";
import { formatSupportDate } from "@/features/support/format";
import {
  canAssignSupportTicket,
  canTransitionSupportTicket,
} from "@/features/support/permissions";
import {
  getSupportAssigneeOptions,
  getSupportTicketDetail,
  hasSupportProjectAccess,
} from "@/features/support/queries";
import { supportTicketIdSchema } from "@/features/support/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface AdminSupportDetailPageProps {
  params: Promise<{ ticketId: string }>;
}

export async function generateMetadata({
  params,
}: AdminSupportDetailPageProps): Promise<Metadata> {
  const { ticketId } = await params;
  return {
    title: supportTicketIdSchema.safeParse(ticketId).success
      ? "Support ticket"
      : "Support ticket not found",
  };
}

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

export default async function AdminSupportDetailPage({
  params,
}: AdminSupportDetailPageProps) {
  const { ticketId } = await params;
  if (!supportTicketIdSchema.safeParse(ticketId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const ticket = await getSupportTicketDetail(member.organizationId, ticketId);
  if (!ticket) {
    notFound();
  }

  const hasProjectAccess = await hasSupportProjectAccess(
    member.organizationId,
    ticket.projectId,
    member.profileId,
  );
  const permissionContext = {
    assignedTo: ticket.assignedTo,
    hasProjectAccess,
  };
  const canAssign = canAssignSupportTicket(member, permissionContext);
  const canTransition = canTransitionSupportTicket(member, permissionContext);
  const assignees = canAssign
    ? await getSupportAssigneeOptions(member.organizationId)
    : [];

  return (
    <div className="space-y-7">
      <Link
        href="/admin/support"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to support
      </Link>

      <PageHeader
        eyebrow={`${ticket.ticketNumber} - ${ticket.clientName}`}
        title={ticket.title}
        description={ticket.projectName ?? "General support request"}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Ticket details</CardTitle>
                <Badge
                  data-testid="support-status-badge"
                  variant={SUPPORT_TICKET_STATUS_BADGES[ticket.status]}
                >
                  {SUPPORT_TICKET_ADMIN_STATUS_LABELS[ticket.status]}
                </Badge>
                <Badge
                  variant={SUPPORT_TICKET_PRIORITY_BADGES[ticket.priority]}
                >
                  {SUPPORT_TICKET_PRIORITY_LABELS[ticket.priority]} priority
                </Badge>
              </div>
              <CardDescription>
                Opened {formatSupportDate(ticket.createdAt)}
                {ticket.creatorName ? ` by ${ticket.creatorName}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Client">
                  <Link
                    href={`/admin/clients/${ticket.clientId}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {ticket.clientName}
                  </Link>
                </DataItem>
                <DataItem label="Project">
                  {ticket.projectId && ticket.projectName ? (
                    <Link
                      href={`/admin/projects/${ticket.projectId}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {ticket.projectName}
                    </Link>
                  ) : (
                    "General support"
                  )}
                </DataItem>
                <DataItem label="Category">{ticket.category}</DataItem>
                <DataItem label="Assigned to">
                  {ticket.assigneeName ?? "Unassigned"}
                </DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="Description">
                    <span className="whitespace-pre-wrap">
                      {ticket.description}
                    </span>
                  </DataItem>
                </div>
                {ticket.resolutionNote ? (
                  <div className="sm:col-span-2 rounded-lg border border-success/20 bg-success-soft p-4">
                    <DataItem label="Resolution note">
                      <span className="whitespace-pre-wrap">
                        {ticket.resolutionNote}
                      </span>
                    </DataItem>
                  </div>
                ) : null}
                <DataItem label="Resolved">
                  {formatSupportDate(ticket.resolvedAt)}
                </DataItem>
                <DataItem label="Closed">
                  {formatSupportDate(ticket.closedAt)}
                </DataItem>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Traceable history of assignments, status changes, and client
                responses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SupportTicketActivityTimeline activities={ticket.activities} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
              <CardDescription>
                Only transitions allowed by the support workflow are shown.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canTransition ? (
                <SupportTicketStatusForm
                  ticketId={ticket.id}
                  currentStatus={ticket.status}
                  hasAssignee={Boolean(ticket.assignedTo)}
                />
              ) : (
                <p className="text-sm text-text-muted">
                  Team members can update only tickets assigned to them.
                </p>
              )}
              {ticket.status === "resolved" ? (
                <p className="mt-4 text-sm text-text-muted">
                  Waiting for the client to confirm the fix or report that the
                  issue remains.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
              <CardDescription>
                Only active members of this organization can be assigned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canAssign ? (
                <SupportTicketAssignForm
                  ticketId={ticket.id}
                  currentAssigneeId={ticket.assignedTo}
                  assignees={assignees}
                />
              ) : (
                <p className="text-sm text-text-secondary">
                  {ticket.assigneeName ?? "Unassigned"}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
