"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/config/env.public";
import { maskEmailForLogging, recipientDomain } from "@/lib/email/resend-result";
import { sendProposalEmail } from "@/lib/email/send-proposal-email";
import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import {
  NON_CONFLICTING_PROPOSAL_STATUSES,
  PROPOSAL_ACCESS_TOKEN_TTL_DAYS,
} from "./constants";
import { isLeadEligibleForProposal, memberCanManageProposals } from "./permissions";
import {
  proposalCreateSchema,
  proposalEditSchema,
  proposalIdSchema,
  proposalItemFormSchema,
} from "./schemas";
import { generateProposalAccessToken } from "./token";
import type { ProposalActionResult } from "./types";

const GENERIC_ERROR =
  "We could not save your changes. Please review the form and try again.";
const SEND_ERROR =
  "We could not send this proposal. No changes were made. Please try again.";

// `send_proposal` and `reissue_proposal_access_token` raise these exact,
// already user-safe messages (no SQL, no schema, no internals) for known
// business-rule rejections. Surfacing them lets an admin see *why* a send
// was rejected (e.g. no line items yet) instead of a generic, misleading
// "try again" message. Anything not in this allowlist — an unexpected
// Postgres error — still falls back to the generic message so raw
// database errors never reach the browser.
const SAFE_RPC_MESSAGES = new Set([
  "Authentication is required.",
  "A valid access token hash is required.",
  "You do not have permission to send this proposal.",
  "You do not have permission to resend this proposal.",
  "This proposal could not be found.",
  "Only draft or changes-requested proposals can be sent.",
  "A proposal title is required before sending.",
  "At least one line item is required before sending.",
  "This proposal cannot be resent right now.",
]);

function safeRpcErrorMessage(
  error: { message?: string | null } | null | undefined,
  fallback: string,
): string {
  if (error?.message && SAFE_RPC_MESSAGES.has(error.message)) {
    return error.message;
  }
  return fallback;
}

function logRpcDiagnostics(
  operation: string,
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
  }
}

/**
 * Development-only, stage-by-stage tracing for the proposal send pipeline.
 * Every call site passes only safe, non-secret fields (status flags, ids,
 * counts, error codes/messages, a recipient domain, and a masked address) so
 * this can stay on by default in development without ever risking a
 * RESEND_API_KEY, database password, cookie, session, complete access
 * token, complete secure proposal URL, or authorization header reaching the
 * console. No-ops entirely in production.
 */
function logSendStage(
  proposalId: string,
  stage: string,
  details: Record<string, unknown> = {},
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.log(`[proposal-send:${stage}]`, { proposalId, ...details });
}

type ProposalInsert = Database["public"]["Tables"]["proposals"]["Insert"];
type ProposalUpdate = Database["public"]["Tables"]["proposals"]["Update"];
type ProposalItemInsert =
  Database["public"]["Tables"]["proposal_items"]["Insert"];
type ProposalItemUpdate =
  Database["public"]["Tables"]["proposal_items"]["Update"];

function validationFailure(error: z.ZodError): ProposalActionResult {
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

function deliverablesFromText(value: string): string[] {
  return value
    .split(",")
    .map((deliverable) => deliverable.trim())
    .filter(Boolean)
    .slice(0, 50);
}

async function findOwnedProposal(
  organizationId: string,
  proposalId: string,
): Promise<{ id: string; status: string; lead_id: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, status, lead_id")
    .eq("id", proposalId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data ?? null;
}

export async function createProposalAction(
  input: unknown,
): Promise<ProposalActionResult> {
  const parsed = proposalCreateSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProposals(member)) {
      return {
        ok: false,
        message: "You do not have permission to create proposals.",
      };
    }

    const supabase = await createClient();
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, status")
      .eq("id", parsed.data.leadId)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (leadError || !lead) {
      return {
        ok: false,
        message: "Select a valid lead in your organization.",
        fieldErrors: { leadId: ["This lead is not available."] },
      };
    }

    if (!isLeadEligibleForProposal(lead.status)) {
      return {
        ok: false,
        message: "Only qualified leads can start a new proposal.",
        fieldErrors: {
          leadId: ["This lead is not eligible for a proposal yet."],
        },
      };
    }

    // Defense in depth: getEligibleLeadOptions already excludes leads with a
    // conflicting active proposal, but the form may be stale (opened before
    // another admin sent one, or reopened after a while), so re-check here
    // before inserting.
    const { data: conflictingProposal, error: conflictingError } =
      await supabase
        .from("proposals")
        .select("id")
        .eq("organization_id", member.organizationId)
        .eq("lead_id", parsed.data.leadId)
        .not(
          "status",
          "in",
          `(${NON_CONFLICTING_PROPOSAL_STATUSES.join(",")})`,
        )
        .limit(1)
        .maybeSingle();

    if (conflictingError) {
      console.error("Proposal conflict check failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    if (conflictingProposal) {
      return {
        ok: false,
        message: "This lead already has an active proposal.",
        fieldErrors: {
          leadId: ["Select a lead without an active proposal."],
        },
      };
    }

    const proposal: ProposalInsert = {
      organization_id: member.organizationId,
      lead_id: parsed.data.leadId,
      title: parsed.data.title,
      summary: emptyToNull(parsed.data.summary),
      scope: emptyToNull(parsed.data.scope),
      deliverables: deliverablesFromText(parsed.data.deliverables),
      timeline_text: emptyToNull(parsed.data.timelineText),
      payment_terms_text: emptyToNull(parsed.data.paymentTermsText),
      terms_text: emptyToNull(parsed.data.termsText),
      valid_until: emptyToNull(parsed.data.validUntil),
      discount: Number(parsed.data.discount),
      tax: Number(parsed.data.tax),
      created_by: member.profileId,
    };
    const { data, error } = await supabase
      .from("proposals")
      .insert(proposal)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Proposal creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/proposals");
    revalidatePath(`/admin/leads/${parsed.data.leadId}`);
    redirect(`/admin/proposals/${data.id}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Proposal creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateProposalAction(
  proposalId: string,
  input: unknown,
): Promise<ProposalActionResult> {
  const idResult = proposalIdSchema.safeParse(proposalId);
  const parsed = proposalEditSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This proposal could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProposals(member)) {
      return {
        ok: false,
        message: "You do not have permission to update proposals.",
      };
    }

    const existing = await findOwnedProposal(
      member.organizationId,
      idResult.data,
    );
    if (!existing) {
      return { ok: false, message: "This proposal could not be found." };
    }

    if (!["draft", "changes_requested"].includes(existing.status)) {
      return {
        ok: false,
        message:
          "This proposal can no longer be edited. Sent proposals become editable again only after changes are requested.",
      };
    }

    const supabase = await createClient();
    const updates: ProposalUpdate = {
      title: parsed.data.title,
      summary: emptyToNull(parsed.data.summary),
      scope: emptyToNull(parsed.data.scope),
      deliverables: deliverablesFromText(parsed.data.deliverables),
      timeline_text: emptyToNull(parsed.data.timelineText),
      payment_terms_text: emptyToNull(parsed.data.paymentTermsText),
      terms_text: emptyToNull(parsed.data.termsText),
      valid_until: emptyToNull(parsed.data.validUntil),
      discount: Number(parsed.data.discount),
      tax: Number(parsed.data.tax),
    };
    const { data, error } = await supabase
      .from("proposals")
      .update(updates)
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Proposal update failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/proposals");
    revalidatePath(`/admin/proposals/${data.id}`);
    return { ok: true, message: "Proposal saved.", proposalId: data.id };
  } catch {
    console.error("Proposal update authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function addProposalItemAction(
  proposalId: string,
  input: unknown,
): Promise<ProposalActionResult> {
  const idResult = proposalIdSchema.safeParse(proposalId);
  const parsed = proposalItemFormSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This proposal could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProposals(member)) {
      return {
        ok: false,
        message: "You do not have permission to edit line items.",
      };
    }

    const proposal = await findOwnedProposal(
      member.organizationId,
      idResult.data,
    );
    if (!proposal) {
      return { ok: false, message: "This proposal could not be found." };
    }

    if (!["draft", "changes_requested"].includes(proposal.status)) {
      return {
        ok: false,
        message: "Line items can only be edited while the proposal is a draft.",
      };
    }

    const supabase = await createClient();
    const { count } = await supabase
      .from("proposal_items")
      .select("id", { count: "exact", head: true })
      .eq("proposal_id", idResult.data);

    const item: ProposalItemInsert = {
      proposal_id: idResult.data,
      name: parsed.data.name,
      description: emptyToNull(parsed.data.description),
      quantity: Number(parsed.data.quantity),
      unit_price: Number(parsed.data.unitPrice),
      sort_order: count ?? 0,
    };
    const { error } = await supabase.from("proposal_items").insert(item);

    if (error) {
      console.error("Proposal line item creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/proposals/${idResult.data}/edit`);
    return { ok: true, message: "Line item added." };
  } catch {
    console.error("Proposal line item authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateProposalItemAction(
  proposalId: string,
  itemId: string,
  input: unknown,
): Promise<ProposalActionResult> {
  const proposalIdResult = proposalIdSchema.safeParse(proposalId);
  const itemIdResult = proposalIdSchema.safeParse(itemId);
  const parsed = proposalItemFormSchema.safeParse(input);
  if (!proposalIdResult.success || !itemIdResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This line item could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProposals(member)) {
      return {
        ok: false,
        message: "You do not have permission to edit line items.",
      };
    }

    const proposal = await findOwnedProposal(
      member.organizationId,
      proposalIdResult.data,
    );
    if (!proposal) {
      return { ok: false, message: "This proposal could not be found." };
    }

    if (!["draft", "changes_requested"].includes(proposal.status)) {
      return {
        ok: false,
        message: "Line items can only be edited while the proposal is a draft.",
      };
    }

    const supabase = await createClient();
    const updates: ProposalItemUpdate = {
      name: parsed.data.name,
      description: emptyToNull(parsed.data.description),
      quantity: Number(parsed.data.quantity),
      unit_price: Number(parsed.data.unitPrice),
    };
    const { data, error } = await supabase
      .from("proposal_items")
      .update(updates)
      .eq("id", itemIdResult.data)
      .eq("proposal_id", proposalIdResult.data)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/proposals/${proposalIdResult.data}/edit`);
    return { ok: true, message: "Line item updated." };
  } catch {
    console.error("Proposal line item update failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function removeProposalItemAction(
  proposalId: string,
  itemId: string,
): Promise<ProposalActionResult> {
  const proposalIdResult = proposalIdSchema.safeParse(proposalId);
  const itemIdResult = proposalIdSchema.safeParse(itemId);
  if (!proposalIdResult.success || !itemIdResult.success) {
    return { ok: false, message: "This line item could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProposals(member)) {
      return {
        ok: false,
        message: "You do not have permission to edit line items.",
      };
    }

    const proposal = await findOwnedProposal(
      member.organizationId,
      proposalIdResult.data,
    );
    if (!proposal) {
      return { ok: false, message: "This proposal could not be found." };
    }

    if (!["draft", "changes_requested"].includes(proposal.status)) {
      return {
        ok: false,
        message: "Line items can only be edited while the proposal is a draft.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("proposal_items")
      .delete()
      .eq("id", itemIdResult.data)
      .eq("proposal_id", proposalIdResult.data);

    if (error) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/proposals/${proposalIdResult.data}/edit`);
    return { ok: true, message: "Line item removed." };
  } catch {
    console.error("Proposal line item removal failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function sendProposalAction(
  proposalId: string,
): Promise<ProposalActionResult> {
  const idResult = proposalIdSchema.safeParse(proposalId);
  if (!idResult.success) {
    return { ok: false, message: "This proposal could not be found." };
  }

  // Stage 1: Server Action started.
  logSendStage(proposalId, "server_action_started");

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProposals(member)) {
      logSendStage(idResult.data, "actor_authorization_failed", {
        role: member.role,
      });
      return {
        ok: false,
        message: "You do not have permission to send proposals.",
      };
    }
    // Stage 3: Actor authorization passed.
    logSendStage(idResult.data, "actor_authorization_passed", {
      role: member.role,
    });

    const proposal = await findOwnedProposal(
      member.organizationId,
      idResult.data,
    );
    if (!proposal) {
      logSendStage(idResult.data, "proposal_loaded", { found: false });
      return { ok: false, message: "This proposal could not be found." };
    }
    // Stage 2: Proposal loaded.
    logSendStage(idResult.data, "proposal_loaded", {
      found: true,
      status: proposal.status,
    });

    const supabase = await createClient();
    const { rawToken, tokenHash } = generateProposalAccessToken();
    // Stage 9 (part 1): Secure access token generated in-process. Never log
    // the raw token or any part of its hash.
    logSendStage(idResult.data, "access_token_generated");
    const expiresAt = new Date(
      Date.now() + PROPOSAL_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Stages 4, 6, 7, 8, 9 (persist), 10, 13, and 14 all happen atomically
    // inside this single RPC: proposal status validation, required-field
    // validation, the already-trigger-maintained subtotal/total, proposal
    // number resolution/generation, access token persistence, version
    // snapshot creation, the status flip to "sent", and (via the
    // proposals_record_status_activity trigger) the lead activity insert.
    // A raised exception rolls every one of these back together, so a
    // failure here can never leave a half-sent proposal.
    logSendStage(idResult.data, "rpc_send_proposal_started");
    const { data: sendResult, error } = await supabase.rpc("send_proposal", {
      target_proposal_id: idResult.data,
      p_token_hash: tokenHash,
      p_token_expires_at: expiresAt,
    });

    if (error || !sendResult || sendResult.length === 0) {
      logRpcDiagnostics("sendProposalAction", error);
      logSendStage(idResult.data, "rpc_send_proposal_failed", {
        code: error?.code ?? null,
        safeMessage: safeRpcErrorMessage(error, SEND_ERROR),
      });
      return { ok: false, message: safeRpcErrorMessage(error, SEND_ERROR) };
    }
    // Stages 4/6/7/8/9/10/13/14 confirmed successful together.
    logSendStage(idResult.data, "rpc_send_proposal_succeeded", {
      proposalNumber: sendResult[0].proposal_number,
      versionNumber: sendResult[0].version_number,
    });

    revalidatePath("/admin/proposals");
    revalidatePath(`/admin/proposals/${idResult.data}`);
    if (proposal.lead_id) {
      revalidatePath(`/admin/leads/${proposal.lead_id}`);
    }

    const { data: proposalDetail } = await supabase
      .from("proposals")
      .select("title, valid_until, lead_id, subtotal, discount, tax, total")
      .eq("id", idResult.data)
      .maybeSingle();

    // Stage 7 (confirmation): totals as actually persisted by the database
    // (server-computed via triggers, never trusted from the browser).
    if (proposalDetail) {
      logSendStage(idResult.data, "trusted_totals_confirmed", {
        subtotal: proposalDetail.subtotal,
        discount: proposalDetail.discount,
        tax: proposalDetail.tax,
        total: proposalDetail.total,
      });
    }

    const leadId = proposalDetail?.lead_id ?? proposal.lead_id;
    if (!leadId) {
      logSendStage(idResult.data, "recipient_resolution_skipped", {
        reason: "no_lead_linked",
      });
      return {
        ok: true,
        message:
          "Proposal sent successfully, but it is not linked to a lead contact to email.",
        proposalId: idResult.data,
      };
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("full_name, email")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead) {
      logSendStage(idResult.data, "recipient_resolution_failed", {
        reason: "lead_not_found",
      });
      return {
        ok: true,
        message:
          "Proposal sent successfully, but the lead contact could not be found to email.",
        proposalId: idResult.data,
      };
    }

    // Stage 5: Recipient resolved. Source is always leads.email for the
    // proposal's linked lead — trimmed and lowercased before use. Only the
    // domain and a masked form are logged, never the raw address.
    const resolvedRecipient = lead.email.trim().toLowerCase();
    logSendStage(idResult.data, "recipient_resolved", {
      source: "lead.email",
      domain: recipientDomain(resolvedRecipient),
      masked: maskEmailForLogging(resolvedRecipient),
    });

    const proposalUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/proposal/${rawToken}`;
    // Stage 9 (part 2): secure link constructed from a validated absolute
    // origin. Never log the full URL (it contains the raw token) — only
    // confirm the origin used.
    logSendStage(idResult.data, "secure_link_created", {
      origin: publicEnv.NEXT_PUBLIC_APP_URL,
    });

    // Stage 11: Resend call started.
    logSendStage(idResult.data, "resend_call_started", {
      domain: recipientDomain(resolvedRecipient),
    });
    const emailResult = await sendProposalEmail({
      toEmail: resolvedRecipient,
      recipientName: lead.full_name,
      proposalTitle: proposalDetail?.title ?? "Your Nexfora proposal",
      proposalNumber: sendResult[0].proposal_number ?? "",
      proposalUrl,
      validUntil: proposalDetail?.valid_until ?? null,
    });
    // Stage 12: Resend result received.
    logSendStage(idResult.data, "resend_result_received", {
      ok: emailResult.ok,
      reason: emailResult.ok ? null : emailResult.reason,
    });

    if (!emailResult.ok) {
      const message =
        emailResult.reason === "not_configured"
          ? "The proposal was sent and is ready to share, but email delivery is not configured yet. Copy the secure link from this page and send it manually, or set up Resend and use Resend email."
          : emailResult.reason === "invalid_recipient"
            ? "The proposal was sent and is ready to share, but the lead's email address on file is invalid. Update the lead's email, then use Resend email."
            : "The proposal was sent and is ready to share, but the email could not be delivered. Use Resend email to try again.";
      return {
        ok: true,
        message,
        proposalId: idResult.data,
      };
    }

    return {
      ok: true,
      message: "Proposal sent and emailed successfully.",
      proposalId: idResult.data,
    };
  } catch (caughtError) {
    logSendStage(proposalId, "unexpected_exception", {
      errorMessage:
        caughtError instanceof Error ? caughtError.message : "Unknown error",
    });
    console.error("Proposal send authorization or persistence failed.");
    return { ok: false, message: SEND_ERROR };
  }
}

export async function resendProposalEmailAction(
  proposalId: string,
): Promise<ProposalActionResult> {
  const idResult = proposalIdSchema.safeParse(proposalId);
  if (!idResult.success) {
    return { ok: false, message: "This proposal could not be found." };
  }

  logSendStage(proposalId, "resend_server_action_started");

  try {
    const member = await requireInternalMember();
    if (!memberCanManageProposals(member)) {
      return {
        ok: false,
        message: "You do not have permission to resend proposals.",
      };
    }
    logSendStage(idResult.data, "resend_actor_authorization_passed", {
      role: member.role,
    });

    const proposal = await findOwnedProposal(
      member.organizationId,
      idResult.data,
    );
    if (!proposal || !proposal.lead_id) {
      logSendStage(idResult.data, "resend_proposal_loaded", {
        found: Boolean(proposal),
        hasLead: Boolean(proposal?.lead_id),
      });
      return {
        ok: false,
        message: "This proposal is not linked to a lead contact to email.",
      };
    }
    logSendStage(idResult.data, "resend_proposal_loaded", {
      found: true,
      status: proposal.status,
    });

    const supabase = await createClient();
    const { rawToken, tokenHash } = generateProposalAccessToken();
    const expiresAt = new Date(
      Date.now() + PROPOSAL_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    logSendStage(idResult.data, "rpc_reissue_access_token_started");
    const { error } = await supabase.rpc("reissue_proposal_access_token", {
      target_proposal_id: idResult.data,
      p_token_hash: tokenHash,
      p_token_expires_at: expiresAt,
    });

    if (error) {
      logRpcDiagnostics("resendProposalEmailAction", error);
      logSendStage(idResult.data, "rpc_reissue_access_token_failed", {
        code: error.code ?? null,
      });
      return {
        ok: false,
        message: safeRpcErrorMessage(
          error,
          "We could not refresh the secure link. Please try again.",
        ),
      };
    }
    logSendStage(idResult.data, "rpc_reissue_access_token_succeeded");

    const { data: proposalDetail } = await supabase
      .from("proposals")
      .select("title, valid_until")
      .eq("id", idResult.data)
      .maybeSingle();

    const { data: lead } = await supabase
      .from("leads")
      .select("full_name, email")
      .eq("id", proposal.lead_id)
      .maybeSingle();

    if (!lead) {
      logSendStage(idResult.data, "resend_recipient_resolution_failed", {
        reason: "lead_not_found",
      });
      return {
        ok: false,
        message: "The lead contact for this proposal could not be found.",
      };
    }

    const resolvedRecipient = lead.email.trim().toLowerCase();
    logSendStage(idResult.data, "resend_recipient_resolved", {
      source: "lead.email",
      domain: recipientDomain(resolvedRecipient),
      masked: maskEmailForLogging(resolvedRecipient),
    });

    const proposalUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/proposal/${rawToken}`;
    logSendStage(idResult.data, "resend_secure_link_created", {
      origin: publicEnv.NEXT_PUBLIC_APP_URL,
    });

    logSendStage(idResult.data, "resend_resend_call_started", {
      domain: recipientDomain(resolvedRecipient),
    });
    const emailResult = await sendProposalEmail({
      toEmail: resolvedRecipient,
      recipientName: lead.full_name,
      proposalTitle: proposalDetail?.title ?? "Your Nexfora proposal",
      proposalNumber: "",
      proposalUrl,
      validUntil: proposalDetail?.valid_until ?? null,
    });
    logSendStage(idResult.data, "resend_resend_result_received", {
      ok: emailResult.ok,
      reason: emailResult.ok ? null : emailResult.reason,
    });

    if (!emailResult.ok) {
      const message =
        emailResult.reason === "not_configured"
          ? "Email delivery is not configured. Set up Resend to send this link."
          : emailResult.reason === "invalid_recipient"
            ? "The lead's email address on file is invalid. Update the lead's email, then try again."
            : "We could not deliver the email. Please try again.";
      return { ok: false, message };
    }

    return { ok: true, message: "Proposal email resent successfully." };
  } catch {
    console.error("Proposal resend authorization or persistence failed.");
    return {
      ok: false,
      message: "We could not resend this proposal. Please try again.",
    };
  }
}
