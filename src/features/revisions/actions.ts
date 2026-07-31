"use server";

import { revalidatePath } from "next/cache";

import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

import { canAssignRevision, canTransitionRevisionStatus } from "./permissions";
import {
  revisionAssignSchema,
  revisionIdSchema,
  revisionStatusTransitionSchema,
} from "./schemas";
import type { RevisionActionResult } from "./types";

const GENERIC_ERROR =
  "We could not update this revision. Please try again.";

interface RevisionAndProject {
  id: string;
  project_id: string;
  assigned_to: string | null;
  projects: { project_manager_id: string | null } | { project_manager_id: string | null }[] | null;
}

function projectRow(
  value: RevisionAndProject["projects"],
): { project_manager_id: string | null } | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function loadRevisionWithProject(
  organizationId: string,
  revisionId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revisions")
    .select(
      "id, project_id, assigned_to, projects!revisions_project_id_fkey(project_manager_id)",
    )
    .eq("organization_id", organizationId)
    .eq("id", revisionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as unknown as RevisionAndProject;
}

async function isProjectMember(
  projectId: string,
  profileId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", profileId)
    .maybeSingle();

  return Boolean(data);
}

export async function transitionRevisionStatusAction(
  revisionId: string,
  input: unknown,
): Promise<RevisionActionResult> {
  const idResult = revisionIdSchema.safeParse(revisionId);
  const parsed = revisionStatusTransitionSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return { ok: false, message: "This revision could not be found." };
  }

  try {
    const member = await requireInternalMember();
    const revision = await loadRevisionWithProject(
      member.organizationId,
      idResult.data,
    );

    if (!revision) {
      return { ok: false, message: "This revision could not be found." };
    }

    const memberOfProject = await isProjectMember(
      revision.project_id,
      member.profileId,
    );

    const canTransition = canTransitionRevisionStatus(
      member,
      {
        projectManagerId: projectRow(revision.projects)?.project_manager_id ?? null,
        isProjectMember: memberOfProject,
      },
      revision.assigned_to,
    );

    if (!canTransition) {
      return {
        ok: false,
        message: "You do not have permission to update this revision.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("transition_revision_status", {
      target_revision_id: idResult.data,
      p_new_status: parsed.data.status,
    });

    if (error) {
      return {
        ok: false,
        message:
          error.message && error.message.length < 200
            ? error.message
            : GENERIC_ERROR,
      };
    }

    revalidatePath("/admin/revisions");
    revalidatePath(`/admin/revisions/${idResult.data}`);
    return { ok: true, message: "Revision status updated." };
  } catch {
    console.error("Revision status update authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function assignRevisionAction(
  revisionId: string,
  input: unknown,
): Promise<RevisionActionResult> {
  const idResult = revisionIdSchema.safeParse(revisionId);
  const parsed = revisionAssignSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This revision could not be found." }
      : {
          ok: false,
          message: "Please correct the highlighted fields.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        };
  }

  try {
    const member = await requireInternalMember();
    const revision = await loadRevisionWithProject(
      member.organizationId,
      idResult.data,
    );

    if (!revision) {
      return { ok: false, message: "This revision could not be found." };
    }

    const memberOfProject = await isProjectMember(
      revision.project_id,
      member.profileId,
    );

    const canAssign = canAssignRevision(member, {
      projectManagerId: projectRow(revision.projects)?.project_manager_id ?? null,
      isProjectMember: memberOfProject,
    });

    if (!canAssign) {
      return {
        ok: false,
        message: "You do not have permission to assign this revision.",
      };
    }

    const assigneeId = parsed.data.assigneeId || null;

    if (assigneeId) {
      const supabase = await createClient();
      const { data: assigneeMembership } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", member.organizationId)
        .eq("user_id", assigneeId)
        .eq("status", "active")
        .maybeSingle();

      if (!assigneeMembership) {
        return {
          ok: false,
          message:
            "The selected assignee is not an active member of this organization.",
          fieldErrors: { assigneeId: ["Select a valid team member."] },
        };
      }
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("revisions")
      .update({ assigned_to: assigneeId })
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId);

    if (error) {
      console.error("Revision assignment failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/revisions");
    revalidatePath(`/admin/revisions/${idResult.data}`);
    return { ok: true, message: "Revision assignment updated." };
  } catch {
    console.error("Revision assignment authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
