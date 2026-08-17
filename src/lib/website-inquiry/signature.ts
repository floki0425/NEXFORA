import { createHmac, timingSafeEqual } from "node:crypto";

// The Nexfora website signs each forwarded project inquiry with a shared
// secret held only by the two servers. The header is shaped like
// `t=<unix_timestamp>,v1=<hex_hmac>`, where the HMAC is
// HMAC-SHA256(secret, `${t}.${rawBody}`) — the same timestamp-prefixed
// construction src/lib/paymongo/webhook-signature.ts already verifies, kept
// deliberately identical so there is one signing idiom in this repository
// rather than two.
//
// Binding the timestamp INTO the signed string is what makes the timestamp
// itself untamperable: an attacker who captured a valid request cannot move
// its `t` forward to defeat the skew window without invalidating `v1`.
//
// Kept dependency-free (no env, no fetch, no Supabase) so it can be unit
// tested directly.

const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

export interface ParsedWebsiteInquirySignature {
  timestamp: number;
  signature: string;
}

export function parseWebsiteInquirySignatureHeader(
  header: string,
): ParsedWebsiteInquirySignature | null {
  const parts = new Map<string, string>();
  for (const segment of header.split(",")) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();
    if (key && value && !parts.has(key)) {
      parts.set(key, value);
    }
  }

  const timestampRaw = parts.get("t");
  if (!timestampRaw || !/^\d{1,15}$/.test(timestampRaw)) {
    return null;
  }

  const signature = parts.get("v1");
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) {
    return null;
  }

  return { timestamp: Number(timestampRaw), signature };
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
 * Verifies a forwarded website inquiry request. Rejects a missing or
 * malformed header, an unset secret, a signature that does not match, and a
 * timestamp outside the replay window — returns false for all of these,
 * never throws and never reports which check failed.
 */
export function verifyWebsiteInquirySignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!signatureHeader || !webhookSecret) {
    return false;
  }

  const parsed = parseWebsiteInquirySignatureHeader(signatureHeader);
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

  return hexSignaturesMatch(expected, parsed.signature);
}
