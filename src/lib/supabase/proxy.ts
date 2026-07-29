import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/config/env.public";

const ADMIN_PATH = "/admin";
const LOGIN_PATH = "/auth/login";
const PORTAL_PATH = "/portal";
const PORTAL_LOGIN_PATH = "/portal/login";
const PORTAL_PUBLIC_PATHS = ["/portal/login", "/portal/invitations/accept"];
const AUTH_CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);
}

function isProtectedPortalPath(pathname: string): boolean {
  if (!(pathname === PORTAL_PATH || pathname.startsWith(`${PORTAL_PATH}/`))) {
    return false;
  }

  return !PORTAL_PUBLIC_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(`${publicPath}/`),
  );
}

function copyAuthState(
  source: NextResponse,
  destination: NextResponse,
): void {
  source.cookies
    .getAll()
    .forEach((cookie) => destination.cookies.set(cookie));

  AUTH_CACHE_HEADERS.forEach((headerName) => {
    const headerValue = source.headers.get(headerName);

    if (headerValue) {
      destination.headers.set(headerName, headerValue);
    }
  });
}

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });

          Object.entries(headers).forEach(([headerName, headerValue]) => {
            supabaseResponse.headers.set(headerName, headerValue);
          });
        },
      },
    },
  );

  // Keep this immediately after client creation so any refresh is persisted
  // before a response is returned.
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const pathname = request.nextUrl.pathname;
  const isUnauthenticated = Boolean(claimsError) || !claimsData?.claims?.sub;

  if ((isAdminPath(pathname) || isProtectedPortalPath(pathname)) && isUnauthenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = isAdminPath(pathname) ? LOGIN_PATH : PORTAL_LOGIN_PATH;
    loginUrl.search = "";

    const redirectResponse = NextResponse.redirect(loginUrl);
    copyAuthState(supabaseResponse, redirectResponse);

    if (!redirectResponse.headers.has("Cache-Control")) {
      redirectResponse.headers.set("Cache-Control", "private, no-store");
    }

    return redirectResponse;
  }

  return supabaseResponse;
}
