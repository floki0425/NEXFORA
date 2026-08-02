import "server-only";

import { serverEnv } from "@/config/env.server";

import { toCentavos } from "./money";

export { toCentavos } from "./money";

const PAYMONGO_API_BASE = "https://api.paymongo.com/v1";

export function isPaymongoConfigured(): boolean {
  return Boolean(serverEnv.PAYMONGO_SECRET_KEY);
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${serverEnv.PAYMONGO_SECRET_KEY}:`).toString("base64")}`;
}

export interface CreateCheckoutSessionInput {
  amount: number;
  currency: string;
  description: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
}

export type CreateCheckoutSessionResult =
  | { ok: true; checkoutSessionId: string; checkoutUrl: string }
  | { ok: false; reason: "not_configured" | "provider_error" };

function logPaymongoDiagnostics(
  operation: string,
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} PayMongo diagnostics`, details);
  }
}

/**
 * Creates a PayMongo hosted Checkout Session for the given, already
 * server-computed amount. Never throws — a misconfigured or failing
 * provider degrades to a safe result the caller reports without ever
 * treating the invoice as paid. Never logs the secret key, the full
 * response body, or any card/payment-method detail.
 */
export async function createPaymongoCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  if (!isPaymongoConfigured()) {
    logPaymongoDiagnostics("createPaymongoCheckoutSession", {
      outcome: "not_configured",
    });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            description: input.description,
            reference_number: input.referenceNumber,
            line_items: [
              {
                currency: input.currency,
                amount: toCentavos(input.amount),
                name: input.description,
                quantity: 1,
              },
            ],
            payment_method_types: ["gcash", "card", "paymaya"],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
          },
        },
      }),
    });

    if (!response.ok) {
      logPaymongoDiagnostics("createPaymongoCheckoutSession", {
        outcome: "provider_error",
        httpStatus: response.status,
      });
      return { ok: false, reason: "provider_error" };
    }

    const body = (await response.json()) as {
      data?: { id?: string; attributes?: { checkout_url?: string } };
    };
    const checkoutSessionId = body.data?.id;
    const checkoutUrl = body.data?.attributes?.checkout_url;

    if (!checkoutSessionId || !checkoutUrl) {
      logPaymongoDiagnostics("createPaymongoCheckoutSession", {
        outcome: "malformed_response",
      });
      return { ok: false, reason: "provider_error" };
    }

    return { ok: true, checkoutSessionId, checkoutUrl };
  } catch (error) {
    logPaymongoDiagnostics("createPaymongoCheckoutSession", {
      outcome: "thrown_exception",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return { ok: false, reason: "provider_error" };
  }
}

export interface PaymongoCheckoutSessionStatus {
  status: string;
  paymentIntentStatus: string | null;
  paidAmount: number | null;
  paidCurrency: string | null;
}

/**
 * Re-fetches a checkout session directly from PayMongo by id — used by the
 * webhook reconciliation path to independently confirm what the event
 * claims, rather than trusting the webhook payload's own amount/status
 * fields alone. Returns null on any failure (network, non-2xx, malformed
 * body); callers must treat null as "could not confirm," never as success.
 */
export async function getPaymongoCheckoutSession(
  checkoutSessionId: string,
): Promise<PaymongoCheckoutSessionStatus | null> {
  if (!isPaymongoConfigured()) {
    return null;
  }

  try {
    const response = await fetch(
      `${PAYMONGO_API_BASE}/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`,
      { headers: { Authorization: authHeader() } },
    );

    if (!response.ok) {
      logPaymongoDiagnostics("getPaymongoCheckoutSession", {
        outcome: "provider_error",
        httpStatus: response.status,
      });
      return null;
    }

    const body = (await response.json()) as {
      data?: {
        attributes?: {
          status?: string;
          payment_intent?: {
            attributes?: {
              status?: string;
              amount?: number;
              currency?: string;
            };
          };
          payments?: {
            attributes?: { status?: string; amount?: number; currency?: string };
          }[];
        };
      };
    };

    const attributes = body.data?.attributes;
    if (!attributes) {
      return null;
    }

    const payment =
      attributes.payment_intent?.attributes ??
      attributes.payments?.[0]?.attributes;

    return {
      status: attributes.status ?? "unknown",
      paymentIntentStatus: payment?.status ?? null,
      paidAmount:
        typeof payment?.amount === "number" ? payment.amount / 100 : null,
      paidCurrency: payment?.currency ?? null,
    };
  } catch (error) {
    logPaymongoDiagnostics("getPaymongoCheckoutSession", {
      outcome: "thrown_exception",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}
