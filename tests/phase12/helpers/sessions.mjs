// Signs in one authenticated client per fixture identity, plus an anon
// client. Assertions must always run through these RLS-bound clients -- never
// through the service-role admin client, which bypasses RLS and would make
// every authorization test vacuously pass.

import {
  createTestAnonClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import { WINDOW_FROM, WINDOW_TO } from "./factory.mjs";

/** Identities that hold a real session. `anon` is added separately. */
export const SESSION_LABELS = [
  "super-admin-a",
  "admin-a",
  "pm-a",
  "team-a",
  "suspended-a",
  "no-membership",
  "portal-owner-a",
  "admin-b",
];

export async function signInPhase12Users(fixtures) {
  const clients = {};
  for (const label of SESSION_LABELS) {
    const user = fixtures.users[label];
    clients[label] = await signInTestUser(user.email, user.password);
  }
  clients.anon = createTestAnonClient();
  return clients;
}

/** Default report arguments for the fixture window. */
export function reportArgs(extra = {}) {
  return { p_from: WINDOW_FROM, p_to: WINDOW_TO, ...extra };
}

/**
 * PostgREST surfaces a raised P0001 with code "P0001", and a missing EXECUTE
 * privilege as "42501". Callers assert on these rather than on message text,
 * so a wording change never silently turns a denial into a pass.
 */
export function errorCode(error) {
  return error?.code ?? null;
}

/** Asserts nothing sensitive leaked in an error surfaced to a caller. */
export function assertSafeErrorShape(assert, error) {
  const serialized = JSON.stringify(error ?? {});
  for (const leak of ["select ", "SELECT ", "pg_catalog", "$function$", "C:\\", "/var/"]) {
    assert.ok(
      !serialized.includes(leak),
      `error payload leaked internal detail "${leak}": ${serialized}`,
    );
  }
}
