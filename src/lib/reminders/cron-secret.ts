import { timingSafeEqual } from "node:crypto";

// Mirrors src/lib/paymongo/webhook-signature.ts's hexSignaturesMatch: check
// length first (timingSafeEqual throws on mismatched buffer lengths) before
// ever calling the constant-time comparison, and never throw on any input
// shape. Never logs the received value — a caller that wants to log a
// diagnostic must not include the raw header/secret in it.
export function verifyCronSecret(
  receivedHeader: string | null,
  configuredSecret: string | undefined,
): boolean {
  if (!configuredSecret || !receivedHeader) {
    return false;
  }

  const prefix = "Bearer ";
  if (!receivedHeader.startsWith(prefix)) {
    return false;
  }

  const received = receivedHeader.slice(prefix.length);
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(configuredSecret, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  try {
    return timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
