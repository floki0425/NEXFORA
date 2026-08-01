"use server";

import { publicEnv } from "@/config/env.public";
import { requirePortalMember } from "@/lib/auth/portal";
import { createPaymongoCheckoutSession } from "@/lib/paymongo/client";
import { createClient } from "@/lib/supabase/server";

import { getPortalInvoiceDetail } from "./queries";
import { portalInvoiceIdSchema } from "./schemas";
import type { PortalInvoiceActionResult } from "./types";

const GENERIC_ERROR = "We could not start this payment. Please try again.";

// start_paymongo_checkout raises these exact, already user-safe messages.
// Anything else falls back to the generic message.
const SAFE_RPC_MESSAGES = new Set([
  "An active client membership is required.",
  "You do not have permission to pay this invoice.",
  "A provider reference is required.",
  "This invoice could not be found.",
  "This invoice is not currently payable online.",
  "This invoice has changed. Please refresh the page and try again.",
  "A payment for this invoice is already in progress.",
]);

function safeRpcErrorMessage(
  error: { message?: string | null } | null | undefined,
): string {
  if (error?.message && SAFE_RPC_MESSAGES.has(error.message)) {
    return error.message;
  }
  return GENERIC_ERROR;
}

export async function createPaymongoCheckoutAction(
  invoiceId: string,
): Promise<PortalInvoiceActionResult> {
  const idResult = portalInvoiceIdSchema.safeParse(invoiceId);
  if (!idResult.success) {
    return { ok: false, message: "This invoice could not be found." };
  }

  try {
    const member = await requirePortalMember();
    if (member.role !== "owner" && member.role !== "manager") {
      return {
        ok: false,
        message: "You do not have permission to pay this invoice.",
      };
    }

    const invoice = await getPortalInvoiceDetail(idResult.data);
    if (!invoice) {
      return { ok: false, message: "This invoice could not be found." };
    }

    if (invoice.balanceDue <= 0) {
      return { ok: false, message: "This invoice has already been paid in full." };
    }

    const origin = publicEnv.NEXT_PUBLIC_APP_URL;
    const session = await createPaymongoCheckoutSession({
      amount: invoice.balanceDue,
      currency: invoice.currency,
      description: `Nexfora invoice ${invoice.invoiceNumber ?? idResult.data}`,
      referenceNumber: idResult.data,
      successUrl: `${origin}/portal/invoices/${idResult.data}?payment=success`,
      cancelUrl: `${origin}/portal/invoices/${idResult.data}?payment=cancelled`,
    });

    if (!session.ok) {
      return {
        ok: false,
        message:
          session.reason === "not_configured"
            ? "Online payment is not available yet. Please contact Nexfora to arrange payment."
            : "We could not reach the payment provider. Please try again.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("start_paymongo_checkout", {
      target_invoice_id: idResult.data,
      p_amount: invoice.balanceDue,
      p_currency: invoice.currency,
      p_provider_reference: session.checkoutSessionId,
      p_checkout_url: session.checkoutUrl,
    });

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("createPaymongoCheckoutAction RPC error", {
          code: error.code,
        });
      }
      return { ok: false, message: safeRpcErrorMessage(error) };
    }

    return {
      ok: true,
      message: "Redirecting to secure checkout…",
      checkoutUrl: session.checkoutUrl,
    };
  } catch {
    console.error("PayMongo checkout authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
