import { ArrowLeft, BriefcaseBusiness, Pencil } from "lucide-react";
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
import { MilestoneForm } from "@/features/projects/components/milestone-form";
import { MilestoneStatusForm } from "@/features/projects/components/milestone-status-form";
import { ProjectMemberForm } from "@/features/projects/components/project-member-form";
import { RemoveMemberButton } from "@/features/projects/components/remove-member-button";
import { TaskForm } from "@/features/projects/components/task-form";
import { TaskStatusForm } from "@/features/projects/components/task-status-form";
import {
  MILESTONE_STATUS_BADGES,
  MILESTONE_STATUS_LABELS,
  PROJECT_MEMBER_ROLE_LABELS,
  PROJECT_PRIORITY_BADGES,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_BADGES,
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_BADGES,
  TASK_STATUS_LABELS,
} from "@/features/projects/constants";
import {
  formatProjectDate,
  formatProjectDay,
  formatProgress,
} from "@/features/projects/format";
import { memberCanManageProjects } from "@/features/projects/permissions";
import {
  getProjectDetail,
  getProjectManagerOptions,
} from "@/features/projects/queries";
import { projectIdSchema } from "@/features/projects/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { projectId } = await params;
  return {
    title: projectIdSchema.safeParse(projectId).success
      ? "Project details"
      : "Project not found",
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

export default async function ProjectDetailPage({
  params,
}: ProjectPageProps) {
  const { projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const project = await getProjectDetail(member.organizationId, projectId);
  if (!project) {
    notFound();
  }

  const canManage = memberCanManageProjects(member);
  const managers = canManage ? await getProjectManagerOptions() : [];
  const assignedUserIds = new Set(project.members.map((m) => m.user_id));
  const memberCandidates = managers.filter(
    (candidate) => !assignedUserIds.has(candidate.id),
  );

  return (
    <div className="space-y-7">
      <Link
        href="/admin/projects"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to projects
      </Link>

      <PageHeader
        eyebrow="Project"
        title={project.name}
        description={`Client: ${project.clientName}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/clients/${project.client_id}`}
              className={buttonStyles({ variant: "secondary" })}
            >
              <BriefcaseBusiness className="size-4" aria-hidden="true" />
              View client
            </Link>
            {canManage ? (
              <Link
                href={`/admin/projects/${project.id}/edit`}
                className={buttonStyles()}
              >
                <Pencil className="size-4" aria-hidden="true" />
                Edit project
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Overview</CardTitle>
                <Badge variant={PROJECT_STATUS_BADGES[project.status]}>
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
                <Badge variant={PROJECT_PRIORITY_BADGES[project.priority]}>
                  {PROJECT_PRIORITY_LABELS[project.priority]} priority
                </Badge>
              </div>
              <CardDescription>
                Core delivery details for this engagement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Client">{project.clientName}</DataItem>
                <DataItem label="Project manager">
                  {project.projectManagerName ?? "Unassigned"}
                </DataItem>
                <DataItem label="Start date">
                  {formatProjectDay(project.start_date)}
                </DataItem>
                <DataItem label="Target date">
                  {formatProjectDay(project.target_date)}
                </DataItem>
                <DataItem label="Progress">
                  {formatProgress(project.progress.percent)}
                  {project.progress.totalTasks > 0
                    ? ` (${project.progress.doneTasks}/${project.progress.totalTasks} tasks done)`
                    : ""}
                </DataItem>
                <DataItem label="Created">
                  {formatProjectDate(project.created_at)}
                </DataItem>
                <DataItem label="Last updated">
                  {formatProjectDate(project.updated_at)}
                </DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="Description">
                    <span className="whitespace-pre-wrap">
                      {project.description}
                    </span>
                  </DataItem>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
              <CardDescription>
                Delivery stages for this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {canManage ? <MilestoneForm projectId={project.id} /> : null}
              {project.milestones.length ? (
                <ul className="divide-y divide-border border-t border-border">
                  {project.milestones.map((milestone) => (
                    <li
                      key={milestone.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {milestone.title}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          Due {formatProjectDay(milestone.due_date)}
                        </p>
                      </div>
                      {canManage ? (
                        <MilestoneStatusForm
                          projectId={project.id}
                          milestoneId={milestone.id}
                          currentStatus={milestone.status}
                        />
                      ) : (
                        <Badge
                          variant={MILESTONE_STATUS_BADGES[milestone.status]}
                        >
                          {MILESTONE_STATUS_LABELS[milestone.status]}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border pt-5 text-sm text-text-muted">
                  No milestones yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>
                Actionable work items for this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {canManage ? (
                <TaskForm
                  projectId={project.id}
                  milestones={project.milestones}
                  assignees={managers}
                />
              ) : null}
              {project.tasks.length ? (
                <ul className="divide-y divide-border border-t border-border">
                  {project.tasks.map((task) => (
                    <li key={task.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {task.title}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                          <span>{TASK_PRIORITY_LABELS[task.priority]} priority</span>
                          <span>{task.assigneeName ?? "Unassigned"}</span>
                          {task.milestoneTitle ? <span>{task.milestoneTitle}</span> : null}
                          <span>Due {formatProjectDay(task.due_date)}</span>
                        </div>
                      </div>
                      {canManage ? (
                        <TaskStatusForm
                          projectId={project.id}
                          taskId={task.id}
                          currentStatus={task.status}
                        />
                      ) : (
                        <Badge variant={TASK_STATUS_BADGES[task.status]}>
                          {TASK_STATUS_LABELS[task.status]}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border pt-5 text-sm text-text-muted">
                  No tasks yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>
                Internal members assigned to this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {canManage ? (
                <ProjectMemberForm
                  projectId={project.id}
                  candidates={memberCandidates}
                />
              ) : null}
              {project.members.length ? (
                <ul className="space-y-3 border-t border-border pt-5">
                  {project.members.map((projectMember) => (
                    <li
                      key={projectMember.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {projectMember.fullName}
                        </p>
                        <p className="text-xs text-text-muted">
                          {PROJECT_MEMBER_ROLE_LABELS[projectMember.role]}
                        </p>
                      </div>
                      {canManage ? (
                        <RemoveMemberButton
                          projectId={project.id}
                          memberRowId={projectMember.id}
                          memberName={projectMember.fullName}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border pt-5 text-sm text-text-muted">
                  No team members assigned yet.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
