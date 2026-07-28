import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/config/env.server";
import type { Database } from "@/types/database";

/**
 * Secret-key Supabase client. Bypasses Row Level Security — server-only,
 * never import into a Client Component. The `server-only` import makes any
 * accidental client-side import fail at build time.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
