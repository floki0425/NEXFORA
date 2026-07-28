import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

import { serverEnv } from "@/config/env.server";

const RECOVERY_COOKIE_NAME = "nexfora-password-recovery";
const RECOVERY_COOKIE_PATH = "/auth/update-password";
const RECOVERY_SESSION_MAX_AGE_SECONDS = 15 * 60;
const SIGNATURE_CONTEXT = "nexfora-password-recovery-v1";

function signRecoveryPayload(payload: string): string {
  return createHmac("sha256", serverEnv.SUPABASE_SECRET_KEY)
    .update(`${SIGNATURE_CONTEXT}:${payload}`)
    .digest("base64url");
}

function hasValidSignature(payload: string, signature: string): boolean {
  const expectedSignature = Buffer.from(
    signRecoveryPayload(payload),
    "utf8",
  );
  const receivedSignature = Buffer.from(signature, "utf8");

  return (
    expectedSignature.length === receivedSignature.length &&
    timingSafeEqual(expectedSignature, receivedSignature)
  );
}

export async function setRecoverySessionMarker(
  userId: string,
): Promise<void> {
  const expiresAt =
    Date.now() + RECOVERY_SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  const signature = signRecoveryPayload(payload);
  const cookieStore = await cookies();

  cookieStore.set({
    name: RECOVERY_COOKIE_NAME,
    value: `${payload}.${signature}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: RECOVERY_COOKIE_PATH,
    maxAge: RECOVERY_SESSION_MAX_AGE_SECONDS,
  });
}

export async function hasValidRecoverySessionMarker(
  userId: string,
): Promise<boolean> {
  const cookieStore = await cookies();
  const marker = cookieStore.get(RECOVERY_COOKIE_NAME)?.value;

  if (!marker) {
    return false;
  }

  const [markerUserId, expiresAtValue, signature, ...extraParts] =
    marker.split(".");

  if (
    extraParts.length > 0 ||
    !markerUserId ||
    !expiresAtValue ||
    !signature ||
    markerUserId !== userId
  ) {
    return false;
  }

  const expiresAt = Number(expiresAtValue);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return false;
  }

  return hasValidSignature(
    `${markerUserId}.${expiresAtValue}`,
    signature,
  );
}

export async function clearRecoverySessionMarker(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set({
    name: RECOVERY_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: RECOVERY_COOKIE_PATH,
    maxAge: 0,
  });
}
