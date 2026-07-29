import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectEditForm } from "@/features/projects/components/project-edit-form";
import { memberCanManageProjects } from "@/features/projects/permissions";
import {
  getProjectDetail,
  getProjectManagerOptions,
} from "@/features/projects/queries";
import { projectIdSchema } from "@/features/projects/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface EditProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: "Edit project",
};

export default async function EditProjectPage({
  params,
}: EditProjectPageProps) {
  const { projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  if (!memberCanManageProjects(member)) {
    notFound();
  }

  const [project, managers] = await Promise.all([
    getProjectDetail(member.organizationId, projectId),
    getProjectManagerOptions(),
  ]);
  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Delivery"
        title={`Edit ${project.name}`}
        description="Update project scope, status, and assignment. The organization and client relationship remain protected."
      />
      <ProjectEditForm project={project} managers={managers} />
    </div>
  );
}
