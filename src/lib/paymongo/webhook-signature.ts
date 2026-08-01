import { createHmac, timingSafeEqual } from "node:crypto";

// PayMongo signs webhooks with a `Paymongo-Signature` header shaped like
// `t=<unix_timestamp>,te=<test_mode_hex_hmac>,li=<live_mode_hex_hmac>`,
// computed as HMAC-SHA256(webhook_secret, `${t}.${rawBody}`) — the same
// timestamp-prefixed HMAC construction Stripe popularized. Exactly one of
// `te`/`li` is meaningful for a given webhook secret (test vs. live); this
// verifies against whichever of the two is present in the header rather
// than assuming one, since the deployed secret's mode is not otherwise
// known to this function. Kept dependency-free (no env/fetch) so it can be
// unit tested directly. Verify the exact header shape against PayMongo's
// current webhook docs before relying on this in production — see
// docs/PHASE_9_INVOICES_PAYMENTS_SETUP.md's manual verification checklist.

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export interface ParsedPaymongoSignature {
  timestamp: number;
  testSignature: string | null;
  liveSignature: string | null;
}

export function parsePaymongoSignatureHeader(
  header: string,
): ParsedPaymongoSignature | null {
  const parts = new Map<string, string>();
  for (const segment of header.split(",")) {
    const [key, value] = segment.split("=");
    if (key && value) {
      parts.set(key.trim(), value.trim());
    }
  }

  const timestampRaw = parts.get("t");
  if (!timestampRaw || !/^\d+$/.test(timestampRaw)) {
    return null;
  }

  const testSignature = parts.get("te") ?? null;
  const liveSignature = parts.get("li") ?? null;
  if (!testSignature && !liveSignature) {
    return null;
  }

  return {
    timestamp: Number(timestampRaw),
    testSignature,
    liveSignature,
  };
}

function hexSignaturesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verifies a PayMongo webhook request. Rejects a missing/malformed header,
 * a signature that does not match, and a timestamp too far from "now"
 * (replay protection) — returns false for all of these, never throws.
 */
export function verifyPaymongoWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  now: Date = new Date(),
): boolean {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const parsed = parsePaymongoSignatureHeader(signatureHeader);
  if (!parsed) {
    return false;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(`${parsed.timestamp}.${rawBody}`)
    .digest("hex");

  const candidates = [parsed.testSignature, parsed.liveSignature].filter(
    (value): value is string => value !== null,
  );

  return candidates.some((candidate) => hexSignaturesMatch(candidate, expected));
}
