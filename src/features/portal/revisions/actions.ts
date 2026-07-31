"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePortalMember } from "@/lib/auth/portal";
import { createClient } from "@/lib/supabase/server";

import {
  portalRevisionIdSchema,
  requestChangesSchema,
  submitRevisionSchema,
} from "./schemas";
import type { PortalRevisionActionResult } from "./types";

const GENERIC_ERROR =
  "We could not save this revision. Please try again.";

const projectIdSchema = z.uuid();

function safeRpcMessage(message: string | undefined): string {
  return message && message.length > 0 && message.length < 200
    ? message
    : GENERIC_ERROR;
}

export async function submitRevisionAction(
  projectId: string,
  input: unknown,
): Promise<PortalRevisionActionResult> {
  const idResult = projectIdSchema.safeParse(projectId);
  const parsed = submitRevisionSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This project could not be found." }
      : {
          ok: false,
          message: "Please correct the highlighted fields.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        };
  }

  try {
    const member = await requirePortalMember();

    if (member.role !== "owner" && member.role !== "manager") {
      return {
        ok: false,
        message: "You do not have permission to submit revisions.",
      };
    }

    // p_page_name/p_section_name are required, non-nullable strings in the
    // generated Args type (no SQL default). The schema already normalizes
    // both to a plain (possibly empty) string via .trim().default(""); an
    // empty string has documented meaning here — the function's own
    // `nullif(btrim(coalesce(...)), '')` treats it as "not provided" — so
    // both are passed through as-is rather than converted to null.
    //
    // p_attachment_file_id is different: it is a uuid-typed column, and ""
    // is not a valid uuid literal (Postgres would reject it at the storage
    // layer), so an empty value can never simply be passed through the way
    // the two text fields above are. The schema validates this field as
    // either "" (no attachment) or an already-verified valid uuid
    // (z.uuid()) — never any other value — so the key is included only when
    // a real attachment id is present, and omitted entirely otherwise. This
    // relies on create_client_revision's p_attachment_file_id parameter now
    // having a `default null` (see
    // 20260803010000_fix_phase_8_attachment_default.sql), which is what
    // makes omitting the key here valid.
    const attachmentFileId = parsed.data.attachmentFileId;

    const supabase = await createClient();
    const { error } = await supabase.rpc("create_client_revision", {
      target_project_id: idResult.data,
      p_page_name: parsed.data.pageName,
      p_section_name: parsed.data.sectionName,
      p_title: parsed.data.title,
      p_description: parsed.data.description,
      p_priority: parsed.data.priority,
      ...(attachmentFileId
        ? { p_attachment_file_id: attachmentFileId }
        : {}),
    });

    if (error) {
      return { ok: false, message: safeRpcMessage(error.message) };
    }

    revalidatePath(`/portal/projects/${idResult.data}`);
    return { ok: true, message: "Revision submitted." };
  } catch {
    console.error("Revision submission authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function approveRevisionAction(
  revisionId: string,
  projectId: string,
): Promise<PortalRevisionActionResult> {
  const idResult = portalRevisionIdSchema.safeParse(revisionId);
  if (!idResult.success) {
    return { ok: false, message: "This revision could not be found." };
  }

  try {
    const member = await requirePortalMember();

    if (member.role !== "owner" && member.role !== "manager") {
      return {
        ok: false,
        message: "You do not have permission to review revisions.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("approve_revision", {
      target_revision_id: idResult.data,
    });

    if (error) {
      return { ok: false, message: safeRpcMessage(error.message) };
    }

    revalidatePath(`/portal/projects/${projectId}`);
    return { ok: true, message: "Revision approved." };
  } catch {
    console.error("Revision approval authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function requestRevisionChangesAction(
  revisionId: string,
  projectId: string,
  input: unknown,
): Promise<PortalRevisionActionResult> {
  const idResult = portalRevisionIdSchema.safeParse(revisionId);
  const parsed = requestChangesSchema.safeParse(input);
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
    const member = await requirePortalMember();

    if (member.role !== "owner" && member.role !== "manager") {
      return {
        ok: false,
        message: "You do not have permission to review revisions.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("request_revision_changes", {
      target_revision_id: idResult.data,
      p_comment: parsed.data.comment,
    });

    if (error) {
      return { ok: false, message: safeRpcMessage(error.message) };
    }

    revalidatePath(`/portal/projects/${projectId}`);
    return { ok: true, message: "Changes requested." };
  } catch {
    console.error("Revision changes-request authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
