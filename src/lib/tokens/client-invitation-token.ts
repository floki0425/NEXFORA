import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Generates a cryptographically random client invitation token. Only the
 * SHA-256 hash is ever persisted; the raw token exists solely in the
 * emailed link and this one-time return value. Shared between the
 * admin-side client-invitations feature (issues the token) and the
 * client-facing portal feature (hashes the token from the accept URL to
 * look it up) — both must hash identically, so this lives in `lib`, not
 * inside either feature.
 */
export function generateClientInvitationToken(): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashClientInvitationToken(rawToken) };
}

export function hashClientInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
