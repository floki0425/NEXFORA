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
import { getInternalFileDownloadUrlAction } from "@/features/files/actions";
import { FileDownloadButton } from "@/features/files/components/file-download-button";
import {
  REVISION_PRIORITY_BADGES,
  REVISION_PRIORITY_LABELS,
  REVISION_STATUS_BADGES,
  REVISION_STATUS_LABELS,
} from "@/features/revisions/constants";
import { RevisionActivityTimeline } from "@/features/revisions/components/revision-activity-timeline";
import { RevisionAssignForm } from "@/features/revisions/components/revision-assign-form";
import { RevisionStatusForm } from "@/features/revisions/components/revision-status-form";
import { formatRevisionDate } from "@/features/revisions/format";
import { canAssignRevision } from "@/features/revisions/permissions";
import {
  getAssigneeOptions,
  getRevisionDetail,
} from "@/features/revisions/queries";
import { revisionIdSchema } from "@/features/revisions/schemas";
import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

interface RevisionDetailPageProps {
  params: Promise<{ revisionId: string }>;
}

export async function generateMetadata({
  params,
}: RevisionDetailPageProps): Promise<Metadata> {
  const { revisionId } = await params;
  return {
    title: revisionIdSchema.safeParse(revisionId).success
      ? "Revision details"
      : "Revision not found",
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

export default async function RevisionDetailPage({
  params,
}: RevisionDetailPageProps) {
  const { revisionId } = await params;
  if (!revisionIdSchema.safeParse(revisionId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const revision = await getRevisionDetail(member.organizationId, revisionId);
  if (!revision) {
    notFound();
  }

  const supabase = await createClient();
  const { data: projectRow } = await supabase
    .from("projects")
    .select("project_manager_id")
    .eq("id", revision.project_id)
    .maybeSingle();
  const { data: membershipRow } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", revision.project_id)
    .eq("user_id", member.profileId)
    .maybeSingle();

  const canAssign = canAssignRevision(member, {
    projectManagerId: projectRow?.project_manager_id ?? null,
    isProjectMember: Boolean(membershipRow),
  });

  const assignees = canAssign ? await getAssigneeOptions(member.organizationId) : [];

  return (
    <div className="space-y-7">
      <Link
        href="/admin/revisions"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to revisions
      </Link>

      <PageHeader
        eyebrow={`${revision.projectName} · ${revision.clientName}`}
        title={revision.title}
        description="Client-submitted revision request."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Details</CardTitle>
                <Badge variant={REVISION_STATUS_BADGES[revision.status]}>
                  {REVISION_STATUS_LABELS[revision.status]}
                </Badge>
                <Badge variant={REVISION_PRIORITY_BADGES[revision.priority]}>
                  {REVISION_PRIORITY_LABELS[revision.priority]} priority
                </Badge>
              </div>
              <CardDescription>
                Submitted {formatRevisionDate(revision.created_at)}
                {revision.submitterName ? ` by ${revision.submitterName}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Page">{revision.page_name}</DataItem>
                <DataItem label="Section">{revision.section_name}</DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="Description">
                    <span className="whitespace-pre-wrap">
                      {revision.description}
                    </span>
                  </DataItem>
                </div>
                {revision.attachment_file_id ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Attachment
                    </dt>
                    <dd className="mt-1.5">
                      <FileDownloadButton
                        fileId={revision.attachment_file_id}
                        action={getInternalFileDownloadUrlAction}
                      />
                    </dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Traceable history of status changes and client responses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RevisionActivityTimeline activities={revision.activities} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
              <CardDescription>Move this revision forward.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RevisionStatusForm
                revisionId={revision.id}
                currentStatus={revision.status}
              />
              {revision.status === "ready_for_review" ? (
                <p className="text-sm text-text-muted">
                  Waiting on the client to approve or request changes.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {canAssign ? (
            <Card>
              <CardHeader>
                <CardTitle>Assignment</CardTitle>
                <CardDescription>
                  Only active members of your organization can be assigned.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RevisionAssignForm
                  revisionId={revision.id}
                  currentAssigneeId={revision.assigned_to}
                  assignees={assignees}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-secondary">
                  {revision.assigneeName ?? "Unassigned"}
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
