import "server-only";

import { Resend } from "resend";

import { serverEnv } from "@/config/env.server";

let cachedClient: Resend | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(serverEnv.RESEND_API_KEY && serverEnv.EMAIL_FROM);
}

/**
 * Returns null when RESEND_API_KEY is unset so callers can degrade to a
 * safe setup error instead of crashing or silently reporting success.
 */
export function getResendClient(): Resend | null {
  if (!serverEnv.RESEND_API_KEY) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new Resend(serverEnv.RESEND_API_KEY);
  }

  return cachedClient;
}
