import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalFileList } from "@/features/portal/files/components/portal-file-list";
import { PortalFileUploadForm } from "@/features/portal/files/components/portal-file-upload-form";
import { getPortalProjectFiles } from "@/features/portal/files/queries";
import { PortalProjectDetail } from "@/features/portal/projects/components/portal-project-detail";
import { getPortalProjectDetail } from "@/features/portal/projects/queries";
import { portalProjectIdSchema } from "@/features/portal/projects/schemas";
import { PortalRevisionList } from "@/features/portal/revisions/components/portal-revision-list";
import { RevisionSubmitForm } from "@/features/portal/revisions/components/revision-submit-form";
import { getPortalRevisions } from "@/features/portal/revisions/queries";
import { requirePortalMember } from "@/lib/auth/portal";

interface PortalProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: "Project details",
};

export default async function PortalProjectDetailPage({
  params,
}: PortalProjectDetailPageProps) {
  const { projectId } = await params;

  if (!portalProjectIdSchema.safeParse(projectId).success) {
    notFound();
  }

  const member = await requirePortalMember();
  const project = await getPortalProjectDetail(projectId);

  if (!project) {
    notFound();
  }

  const canWrite = member.role === "owner" || member.role === "manager";
  const [files, revisions] = await Promise.all([
    getPortalProjectFiles(projectId),
    getPortalRevisions(projectId),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/portal/projects"
        className={buttonStyles({ variant: "ghost", size: "sm" })}
      >
        ← Back to projects
      </Link>
      <PortalProjectDetail project={project} />

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {canWrite ? <PortalFileUploadForm projectId={projectId} /> : null}
          <PortalFileList files={files} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revisions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {canWrite ? (
            <RevisionSubmitForm
              projectId={projectId}
              attachmentOptions={files.map((file) => ({
                id: file.id,
                fileName: file.fileName,
              }))}
            />
          ) : null}
          <PortalRevisionList
            projectId={projectId}
            revisions={revisions}
            canReview={canWrite}
          />
        </CardContent>
      </Card>
    </div>
  );
}
