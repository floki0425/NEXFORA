import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Generates a cryptographically random proposal access token. Only the
 * SHA-256 hash is ever persisted; the raw token exists solely in the
 * emailed link and this one-time return value.
 */
export function generateProposalAccessToken(): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashProposalAccessToken(rawToken) };
}

export function hashProposalAccessToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
