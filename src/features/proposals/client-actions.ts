"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { PROPOSAL_STATUSES } from "./constants";
import { requestProposalChangesSchema } from "./schemas";
import { hashProposalAccessToken } from "./token";
import type { ClientProposalActionResult, ClientProposalView } from "./types";

const GENERIC_INVALID_MESSAGE =
  "This proposal link is invalid or has expired.";
const GENERIC_ERROR_MESSAGE =
  "We couldn't process your request. Please try again.";

const clientProposalItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  quantity: z.number(),
  unit_price: z.number(),
  sort_order: z.number(),
});

const clientProposalViewSchema = z.object({
  id: z.string(),
  proposal_number: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  scope: z.string().nullable(),
  deliverables: z.unknown(),
  timeline_text: z.string().nullable(),
  payment_terms_text: z.string().nullable(),
  terms_text: z.string().nullable(),
  currency: z.string(),
  subtotal: z.number(),
  discount: z.number(),
  tax: z.number(),
  total: z.number(),
  valid_until: z.string().nullable(),
  status: z.enum(PROPOSAL_STATUSES),
  sent_at: z.string().nullable(),
  items: z.array(clientProposalItemSchema),
});

function logSupabaseError(
  operation: string,
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null },
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}

export async function viewProposalByTokenAction(
  rawToken: string,
): Promise<ClientProposalView | null> {
  if (!rawToken || rawToken.length > 200) {
    return null;
  }

  const tokenHash = hashProposalAccessToken(rawToken);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("view_proposal_by_token", {
    p_token_hash: tokenHash,
  });

  if (error) {
    logSupabaseError("viewProposalByTokenAction", error);
    return null;
  }

  if (!data) {
    return null;
  }

  const parsed = clientProposalViewSchema.safeParse(data);
  return parsed.success ? (parsed.data as ClientProposalView) : null;
}

export async function acceptProposalByTokenAction(
  rawToken: string,
): Promise<ClientProposalActionResult> {
  if (!rawToken || rawToken.length > 200) {
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }

  try {
    const tokenHash = hashProposalAccessToken(rawToken);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_proposal_by_token", {
      p_token_hash: tokenHash,
    });

    if (error) {
      logSupabaseError("acceptProposalByTokenAction", error);
      return { ok: false, message: GENERIC_ERROR_MESSAGE };
    }

    if (!data) {
      return { ok: false, message: GENERIC_INVALID_MESSAGE };
    }

    const result = data as { status?: string };
    return {
      ok: true,
      message: "Thank you — this proposal has been accepted.",
      status: (result.status as ClientProposalActionResult["status"]) ?? "accepted",
    };
  } catch {
    console.error("Proposal acceptance failed.");
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }
}

export async function declineProposalByTokenAction(
  rawToken: string,
): Promise<ClientProposalActionResult> {
  if (!rawToken || rawToken.length > 200) {
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }

  try {
    const tokenHash = hashProposalAccessToken(rawToken);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("decline_proposal_by_token", {
      p_token_hash: tokenHash,
    });

    if (error) {
      logSupabaseError("declineProposalByTokenAction", error);
      return { ok: false, message: GENERIC_ERROR_MESSAGE };
    }

    if (!data) {
      return { ok: false, message: GENERIC_INVALID_MESSAGE };
    }

    const result = data as { status?: string };
    return {
      ok: true,
      message: "This proposal has been declined.",
      status: (result.status as ClientProposalActionResult["status"]) ?? "declined",
    };
  } catch {
    console.error("Proposal decline failed.");
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }
}

export async function requestProposalChangesByTokenAction(
  rawToken: string,
  input: unknown,
): Promise<ClientProposalActionResult> {
  if (!rawToken || rawToken.length > 200) {
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }

  const parsed = requestProposalChangesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Please describe the requested changes.",
    };
  }

  try {
    const tokenHash = hashProposalAccessToken(rawToken);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "request_proposal_changes_by_token",
      { p_token_hash: tokenHash, p_message: parsed.data.message },
    );

    if (error) {
      logSupabaseError("requestProposalChangesByTokenAction", error);
      return { ok: false, message: GENERIC_ERROR_MESSAGE };
    }

    if (!data) {
      return { ok: false, message: GENERIC_INVALID_MESSAGE };
    }

    return {
      ok: true,
      message: "Your requested changes have been sent to Nexfora.",
      status: "changes_requested",
    };
  } catch {
    console.error("Proposal changes-requested action failed.");
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }
}
