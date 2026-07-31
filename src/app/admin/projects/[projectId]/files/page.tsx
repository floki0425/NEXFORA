import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { InternalFileUploadForm } from "@/features/files/components/internal-file-upload-form";
import { InternalFileList } from "@/features/files/components/internal-file-list";
import { canManageProjectFiles } from "@/features/files/permissions";
import { getProjectFiles } from "@/features/files/queries";
import { getProjectDetail } from "@/features/projects/queries";
import { projectIdSchema } from "@/features/projects/schemas";
import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

interface ProjectFilesPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: "Project files",
};

export default async function ProjectFilesPage({
  params,
}: ProjectFilesPageProps) {
  const { projectId } = await params;
  if (!projectIdSchema.safeParse(projectId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const project = await getProjectDetail(member.organizationId, projectId);
  if (!project) {
    notFound();
  }

  const supabase = await createClient();
  const { data: membershipRow } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", member.profileId)
    .maybeSingle();

  const canManage = canManageProjectFiles(member, {
    projectManagerId: project.project_manager_id,
    isProjectMember: Boolean(membershipRow),
  });

  const files = await getProjectFiles(member.organizationId, projectId);

  return (
    <div className="space-y-7">
      <Link
        href={`/admin/projects/${projectId}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to project
      </Link>

      <PageHeader
        eyebrow={project.name}
        title="Files"
        description="Private files for this project. Client-visible files are shown in the client portal; internal files never are."
      />

      <Card>
        <CardContent className="space-y-6 pt-6">
          {canManage ? (
            <div className="space-y-3 border-b border-border pb-6">
              <h2 className="text-sm font-semibold text-foreground">
                Upload a file
              </h2>
              <InternalFileUploadForm projectId={projectId} />
            </div>
          ) : null}
          <InternalFileList files={files} />
        </CardContent>
      </Card>
    </div>
  );
}
