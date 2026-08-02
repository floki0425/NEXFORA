import { NextResponse } from "next/server";

import { serverEnv } from "@/config/env.server";
import { verifyPaymongoWebhookSignature } from "@/lib/paymongo/webhook-signature";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// A webhook request carries no Supabase Auth session — PayMongo calls this
// route server-to-server, not through a signed-in browser — so the
// service-role admin client is the one legitimate way to reach
// reconcile_paymongo_webhook_event (which is granted to service_role only,
// never authenticated/anon). See docs/PHASE_9_INVOICES_PAYMENTS_SETUP.md for
// the full idempotency/verification design.

interface PaymongoEventPayload {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      data?: {
        id?: string;
        attributes?: {
          status?: string;
          payment_intent?: {
            attributes?: { status?: string; amount?: number; currency?: string };
          };
          payments?: {
            attributes?: { status?: string; amount?: number; currency?: string };
          }[];
        };
      };
    };
  };
}

function mapPaymongoStatusToEventStatus(
  checkoutStatus: string | undefined,
  paymentStatus: string | undefined,
): string {
  if (paymentStatus === "paid" || checkoutStatus === "paid") {
    return "paid";
  }
  if (paymentStatus === "failed") {
    return "failed";
  }
  if (checkoutStatus === "expired") {
    return "expired";
  }
  if (checkoutStatus === "cancelled" || checkoutStatus === "canceled") {
    return "cancelled";
  }
  return "unknown";
}

// Always returns a generic, identical-shaped response — never leaks
// reconciliation details (why a payment matched or didn't) into the HTTP
// response body, and never echoes back any part of the request.
function safeResponse(receivedHttpStatus = 200) {
  return NextResponse.json({ received: true }, { status: receivedHttpStatus });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("paymongo-signature");

  if (
    !serverEnv.PAYMONGO_WEBHOOK_SECRET ||
    !verifyPaymongoWebhookSignature(
      rawBody,
      signatureHeader,
      serverEnv.PAYMONGO_WEBHOOK_SECRET,
    )
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[paymongo-webhook] signature verification failed");
    }
    // Signature failures are the one case that must not be a generic 200 —
    // PayMongo does not retry on 4xx for a bad signature, and a 200 here
    // would incorrectly confirm receipt of an unverified request.
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let payload: PaymongoEventPayload;
  try {
    payload = JSON.parse(rawBody) as PaymongoEventPayload;
  } catch {
    return safeResponse();
  }

  const eventId = payload.data?.id;
  const eventType = payload.data?.attributes?.type;
  const checkoutSession = payload.data?.attributes?.data;
  const checkoutSessionId = checkoutSession?.id;
  const checkoutAttributes = checkoutSession?.attributes;
  const paymentAttributes =
    checkoutAttributes?.payment_intent?.attributes ??
    checkoutAttributes?.payments?.[0]?.attributes;

  if (!eventId || !checkoutSessionId) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[paymongo-webhook] missing event id or session id", {
        eventType: eventType ?? null,
      });
    }
    return safeResponse();
  }

  const eventStatus = mapPaymongoStatusToEventStatus(
    checkoutAttributes?.status,
    paymentAttributes?.status,
  );
  const amount =
    typeof paymentAttributes?.amount === "number"
      ? paymentAttributes.amount / 100
      : null;
  const currency = paymentAttributes?.currency ?? null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("reconcile_paymongo_webhook_event", {
      p_provider_reference: checkoutSessionId,
      p_provider_event_id: eventId,
      // A missing amount/currency in the webhook payload is deliberately
      // coerced to a sentinel that can never legitimately match a stored
      // payment (payments_amount_check requires amount > 0, so 0 never
      // matches; a real currency is always a 3-letter code, so "" never
      // matches) — reconcile_paymongo_webhook_event's own `is distinct
      // from` comparison then safely reports amount_mismatch rather than
      // ever coincidentally settling a payment against unknown data.
      p_amount: amount ?? 0,
      p_currency: currency ?? "",
      p_event_status: eventStatus,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[paymongo-webhook] reconciled", {
        outcome: error ? "rpc_error" : (data?.[0]?.outcome ?? "unknown"),
        eventType: eventType ?? null,
      });
    }

    if (error && process.env.NODE_ENV !== "production") {
      console.error("[paymongo-webhook] reconciliation RPC error", {
        code: error.code,
      });
    }
  } catch (caughtError) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[paymongo-webhook] unexpected exception", {
        errorMessage:
          caughtError instanceof Error ? caughtError.message : "Unknown error",
      });
    }
    // A transient failure here should let PayMongo retry rather than
    // silently swallowing the event.
    return safeResponse(500);
  }

  return safeResponse();
}
