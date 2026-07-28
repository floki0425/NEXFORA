import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/config/env.public";

/**
 * Supabase client for use in Client Components.
 * Uses the public URL and publishable key only.
 */
export function createClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
