// Supabase client constructors for Phase 8 integration tests, using the
// dedicated TEST_* project — never the application's own configured
// project, and never the production service-role key.
//
// - createTestAdminClient(): service-role client, used ONLY by test
//   setup/cleanup (factory.mjs) to create and tear down fixtures. Test
//   *assertions* must never use this client — they use
//   createTestUserClient()/createTestAnonClient() so RLS is genuinely
//   exercised, matching "application behavior under test must use normal
//   authenticated clients and RLS."
// - createTestAnonClient(): unauthenticated client, for anonymous-access
//   denial checks.
// - signInTestUser(): authenticates as a specific test user email/password
//   and returns a client scoped to that session.

import { createClient } from "@supabase/supabase-js";

import { getPhase8SupabaseTestConfig } from "./test-env.mjs";

export function createTestAdminClient() {
  const config = getPhase8SupabaseTestConfig();
  if (!config) {
    throw new Error(
      "createTestAdminClient() called without a configured TEST_SUPABASE_* environment.",
    );
  }

  return createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export function createTestAnonClient() {
  const config = getPhase8SupabaseTestConfig();
  if (!config) {
    throw new Error(
      "createTestAnonClient() called without a configured TEST_SUPABASE_* environment.",
    );
  }

  return createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

export async function signInTestUser(email, password) {
  const config = getPhase8SupabaseTestConfig();
  if (!config) {
    throw new Error(
      "signInTestUser() called without a configured TEST_SUPABASE_* environment.",
    );
  }

  const client = createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInTestUser(${email}) failed: ${error.message}`);
  }

  return client;
}
