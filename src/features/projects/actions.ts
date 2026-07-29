"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { memberCanManageProjects } from "./permissions";
import {
  milestoneFormSchema,
  milestoneStatusSchema,
  projectCreateSchema,
  projectEditSchema,
  projectIdSchema,
  projectMemberFormSchema,
  taskFormSchema,
  taskStatusSchema,
} from "./schemas";
import type { ProjectActionResult } from "./types";

const GENERIC_ERROR =
  "We could not save your changes. Please review the form and try again.";

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];
type MilestoneInsert = Database["public"]["Tables"]["milestones"]["Insert"];
type MilestoneUpdate = Database["public"]["Tables"]["milestones"]["Update"];
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

function validationFailure(error: z.ZodError): ProjectActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function isRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

async function isActiveOrganizationMember(
  organizationId: string,
  profileId: string | null,
): Promise<boolean> {
  if (!profileId) {
    return true;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", profileId)
    .eq("status", "active")
    .maybeSingle();

  return !error && Boolean(data);
}

async function findOwnedProject(
  organizationId: string,
  projectId: string,
): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data ?? null;
}

export async function createProjectAction(
  input: unknown,
): Promise<ProjectActionResult> {
  const parsed = projectCreateSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to create projects.",
      };
    }

    const supabase = await createClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", parsed.data.clientId)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (clientError || !client) {
      return {
        ok: false,
        message: "Select a valid client in your organization.",
        fieldErrors: { clientId: ["This client is not available."] },
      };
    }

    const projectManagerId = emptyToNull(parsed.data.projectManagerId);
    if (
      !(await isActiveOrganizationMember(
        member.organizationId,
        projectManagerId,
      ))
    ) {
      return {
        ok: false,
        message:
          "The selected project manager is not an active member of this organization.",
        fieldErrors: {
          projectManagerId: ["Select a valid team member."],
        },
      };
    }

    const project: ProjectInsert = {
      organization_id: member.organizationId,
      client_id: parsed.data.clientId,
      name: parsed.data.name,
      description: emptyToNull(parsed.data.description),
      priority: parsed.data.priority,
      start_date: emptyToNull(parsed.data.startDate),
      target_date: emptyToNull(parsed.data.targetDate),
      project_manager_id: projectManagerId,
    };
    const { data, error } = await supabase
      .from("projects")
      .insert(project)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Project creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/projects");
    revalidatePath(`/admin/clients/${parsed.data.clientId}`);
    redirect(`/admin/projects/${data.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Project creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateProjectAction(
  projectId: string,
  input: unknown,
): Promise<ProjectActionResult> {
  const idResult = projectIdSchema.safeParse(projectId);
  const parsed = projectEditSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This project could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to update projects.",
      };
    }

    const existing = await findOwnedProject(
      member.organizationId,
      idResult.data,
    );
    if (!existing) {
      return { ok: false, message: "This project could not be found." };
    }

    const projectManagerId = emptyToNull(parsed.data.projectManagerId);
    if (
      !(await isActiveOrganizationMember(
        member.organizationId,
        projectManagerId,
      ))
    ) {
      return {
        ok: false,
        message:
          "The selected project manager is not an active member of this organization.",
        fieldErrors: {
          projectManagerId: ["Select a valid team member."],
        },
      };
    }

    const supabase = await createClient();
    const updates: ProjectUpdate = {
      name: parsed.data.name,
      description: emptyToNull(parsed.data.description),
      status: parsed.data.status,
      priority: parsed.data.priority,
      start_date: emptyToNull(parsed.data.startDate),
      target_date: emptyToNull(parsed.data.targetDate),
      project_manager_id: projectManagerId,
      completed_at: parsed.data.status === "completed" ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Project update failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${data.id}`);
    redirect(`/admin/projects/${data.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Project update authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function createMilestoneAction(
  projectId: string,
  input: unknown,
): Promise<ProjectActionResult> {
  const idResult = projectIdSchema.safeParse(projectId);
  const parsed = milestoneFormSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This project could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to add milestones.",
      };
    }

    const project = await findOwnedProject(
      member.organizationId,
      idResult.data,
    );
    if (!project) {
      return { ok: false, message: "This project could not be found." };
    }

    const supabase = await createClient();
    const { count } = await supabase
      .from("milestones")
      .select("id", { count: "exact", head: true })
      .eq("project_id", idResult.data);

    const milestone: MilestoneInsert = {
      project_id: idResult.data,
      title: parsed.data.title,
      description: emptyToNull(parsed.data.description),
      due_date: emptyToNull(parsed.data.dueDate),
      sort_order: count ?? 0,
    };
    const { error } = await supabase.from("milestones").insert(milestone);

    if (error) {
      console.error("Milestone creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/projects/${idResult.data}`);
    return { ok: true, message: "Milestone added." };
  } catch {
    console.error("Milestone creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateMilestoneStatusAction(
  projectId: string,
  milestoneId: string,
  input: unknown,
): Promise<ProjectActionResult> {
  const projectIdResult = projectIdSchema.safeParse(projectId);
  const milestoneIdResult = projectIdSchema.safeParse(milestoneId);
  const parsed = milestoneStatusSchema.safeParse(input);
  if (!projectIdResult.success || !milestoneIdResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This milestone could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to update milestones.",
      };
    }

    const project = await findOwnedProject(
      member.organizationId,
      projectIdResult.data,
    );
    if (!project) {
      return { ok: false, message: "This project could not be found." };
    }

    const supabase = await createClient();
    const updates: MilestoneUpdate = {
      status: parsed.data.status,
      completed_at:
        parsed.data.status === "completed" ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from("milestones")
      .update(updates)
      .eq("id", milestoneIdResult.data)
      .eq("project_id", projectIdResult.data)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/projects/${projectIdResult.data}`);
    return { ok: true, message: "Milestone updated." };
  } catch {
    console.error("Milestone status update failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function createTaskAction(
  projectId: string,
  input: unknown,
): Promise<ProjectActionResult> {
  const idResult = projectIdSchema.safeParse(projectId);
  const parsed = taskFormSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This project could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to add tasks.",
      };
    }

    const project = await findOwnedProject(
      member.organizationId,
      idResult.data,
    );
    if (!project) {
      return { ok: false, message: "This project could not be found." };
    }

    const assignedTo = emptyToNull(parsed.data.assignedTo);
    if (
      !(await isActiveOrganizationMember(member.organizationId, assignedTo))
    ) {
      return {
        ok: false,
        message:
          "The selected assignee is not an active member of this organization.",
        fieldErrors: { assignedTo: ["Select a valid team member."] },
      };
    }

    const milestoneId = emptyToNull(parsed.data.milestoneId);
    const supabase = await createClient();

    if (milestoneId) {
      const { data: milestone } = await supabase
        .from("milestones")
        .select("id")
        .eq("id", milestoneId)
        .eq("project_id", idResult.data)
        .maybeSingle();

      if (!milestone) {
        return {
          ok: false,
          message: "Select a valid milestone for this project.",
          fieldErrors: { milestoneId: ["This milestone is not available."] },
        };
      }
    }

    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", idResult.data);

    const task: TaskInsert = {
      project_id: idResult.data,
      milestone_id: milestoneId,
      title: parsed.data.title,
      description: emptyToNull(parsed.data.description),
      priority: parsed.data.priority,
      assigned_to: assignedTo,
      due_date: emptyToNull(parsed.data.dueDate),
      sort_order: count ?? 0,
    };
    const { error } = await supabase.from("tasks").insert(task);

    if (error) {
      console.error("Task creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/projects/${idResult.data}`);
    return { ok: true, message: "Task added." };
  } catch {
    console.error("Task creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateTaskStatusAction(
  projectId: string,
  taskId: string,
  input: unknown,
): Promise<ProjectActionResult> {
  const projectIdResult = projectIdSchema.safeParse(projectId);
  const taskIdResult = projectIdSchema.safeParse(taskId);
  const parsed = taskStatusSchema.safeParse(input);
  if (!projectIdResult.success || !taskIdResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This task could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to update tasks.",
      };
    }

    const project = await findOwnedProject(
      member.organizationId,
      projectIdResult.data,
    );
    if (!project) {
      return { ok: false, message: "This project could not be found." };
    }

    const supabase = await createClient();
    const updates: TaskUpdate = {
      status: parsed.data.status,
      completed_at:
        parsed.data.status === "done" ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskIdResult.data)
      .eq("project_id", projectIdResult.data)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/projects/${projectIdResult.data}`);
    return { ok: true, message: "Task updated." };
  } catch {
    console.error("Task status update failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function addProjectMemberAction(
  projectId: string,
  input: unknown,
): Promise<ProjectActionResult> {
  const idResult = projectIdSchema.safeParse(projectId);
  const parsed = projectMemberFormSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This project could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to assign team members.",
      };
    }

    const project = await findOwnedProject(
      member.organizationId,
      idResult.data,
    );
    if (!project) {
      return { ok: false, message: "This project could not be found." };
    }

    if (
      !(await isActiveOrganizationMember(
        member.organizationId,
        parsed.data.userId,
      ))
    ) {
      return {
        ok: false,
        message:
          "The selected team member is not an active member of this organization.",
        fieldErrors: { userId: ["Select a valid team member."] },
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("project_members").insert({
      project_id: idResult.data,
      user_id: parsed.data.userId,
      role: parsed.data.role,
    });

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          message: "This team member is already assigned to the project.",
        };
      }

      console.error("Project member assignment failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/projects/${idResult.data}`);
    return { ok: true, message: "Team member assigned." };
  } catch {
    console.error("Project member assignment authorization failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function removeProjectMemberAction(
  projectId: string,
  memberRowId: string,
): Promise<ProjectActionResult> {
  const projectIdResult = projectIdSchema.safeParse(projectId);
  const memberRowIdResult = projectIdSchema.safeParse(memberRowId);
  if (!projectIdResult.success || !memberRowIdResult.success) {
    return { ok: false, message: "This team member could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProjects(member)) {
      return {
        ok: false,
        message: "You do not have permission to remove team members.",
      };
    }

    const project = await findOwnedProject(
      member.organizationId,
      projectIdResult.data,
    );
    if (!project) {
      return { ok: false, message: "This project could not be found." };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("id", memberRowIdResult.data)
      .eq("project_id", projectIdResult.data);

    if (error) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/projects/${projectIdResult.data}`);
    return { ok: true, message: "Team member removed." };
  } catch {
    console.error("Project member removal failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
