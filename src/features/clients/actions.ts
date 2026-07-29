"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import {
  canConvertLeadToClient,
  isAllowedClientStatusEdit,
  memberCanManageClients,
} from "./permissions";
import {
  clientFormSchema,
  clientIdSchema,
  type ClientFormInput,
} from "./schemas";
import type { ClientActionResult } from "./types";

const CLIENT_SAVE_ERROR =
  "We could not save this client. Your changes were not applied. Please try again.";
const CONVERSION_ERROR =
  "We could not convert this lead. No client was created. Please try again.";

type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];
type ConvertLeadArgs =
  Database["public"]["Functions"]["convert_lead_to_client"]["Args"];

function validationFailure(error: z.ZodError): ClientActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
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

export async function updateClientAction(
  clientId: string,
  input: ClientFormInput,
): Promise<ClientActionResult> {
  const idResult = clientIdSchema.safeParse(clientId);
  const parsed = clientFormSchema.safeParse(input);

  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This client could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageClients(member)) {
      return {
        ok: false,
        message: "You do not have permission to update clients.",
      };
    }

    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("clients")
      .select("id, status")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      return { ok: false, message: "This client could not be found." };
    }

    if (
      !isAllowedClientStatusEdit(
        existing.status,
        parsed.data.status,
      )
    ) {
      return {
        ok: false,
        message:
          "Archived status changes require the dedicated archive workflow.",
        fieldErrors: {
          status: ["Archived status changes are not available here."],
        },
      };
    }

    const updates: ClientUpdate = {
      business_name: parsed.data.businessName,
      contact_name: parsed.data.contactName,
      email: parsed.data.email,
      phone: emptyToNull(parsed.data.phone),
      industry: emptyToNull(parsed.data.industry),
      website_url: emptyToNull(parsed.data.websiteUrl),
      billing_address: emptyToNull(parsed.data.billingAddress),
      notes: emptyToNull(parsed.data.notes),
      status: parsed.data.status,
    };
    const { data, error } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Client update failed.");
      return { ok: false, message: CLIENT_SAVE_ERROR };
    }

    revalidatePath("/admin/clients");
    revalidatePath(`/admin/clients/${data.id}`);
    redirect(`/admin/clients/${data.id}?updated=1`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Client update authorization or persistence failed.");
    return { ok: false, message: CLIENT_SAVE_ERROR };
  }
}

export async function convertLeadToClientAction(
  leadId: string,
): Promise<ClientActionResult> {
  const idResult = clientIdSchema.safeParse(leadId);
  if (!idResult.success) {
    return { ok: false, message: "This lead could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageClients(member)) {
      return {
        ok: false,
        message: "You do not have permission to convert leads.",
      };
    }

    const supabase = await createClient();
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, status, converted_client_id")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (leadError || !lead) {
      return { ok: false, message: "This lead could not be found." };
    }

    if (lead.converted_client_id) {
      redirect(
        `/admin/clients/${lead.converted_client_id}?conversion=existing`,
      );
    }

    if (
      !canConvertLeadToClient(
        member.role,
        lead.status,
        lead.converted_client_id,
      )
    ) {
      return {
        ok: false,
        message: "Only won leads that have not been converted are eligible.",
      };
    }

    const args: ConvertLeadArgs = {
      target_lead_id: lead.id,
    };
    const { data, error } = await supabase.rpc(
      "convert_lead_to_client",
      args,
    );
    const conversion = data?.[0];

    if (error || !conversion) {
      console.error("Lead conversion failed.");
      return { ok: false, message: CONVERSION_ERROR };
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath("/admin/clients");
    revalidatePath(`/admin/clients/${conversion.client_id}`);

    redirect(
      `/admin/clients/${conversion.client_id}?conversion=${
        conversion.created_new ? "created" : "existing"
      }`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Lead conversion authorization or persistence failed.");
    return { ok: false, message: CONVERSION_ERROR };
  }
}
