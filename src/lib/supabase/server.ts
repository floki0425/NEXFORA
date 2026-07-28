import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/config/env.public";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes auth cookies via the Next.js cookie store — the
 * setAll write can fail when called from a Server Component (cookies are
 * read-only there), which is safe to ignore as long as session refresh is
 * also handled in the root proxy.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignored when called from a Server Component.
          }
        },
      },
    },
  );
}
