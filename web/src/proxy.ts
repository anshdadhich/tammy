import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getVerifiedClaims } from "@/lib/supabase-claims";

/**
 * Refreshes Supabase Auth cookies on incoming requests so
 * server components can read the current session
 * created by OTP verify, /auth/confirm, or the client hash handler.
 * Enforces nothing — route-level checks stay in lib/supabase-user.ts.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Misconfigured env must never break pages — auth just stays anon.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verify claims locally for asymmetric JWT keys and refresh near-expiry
  // sessions. getClaims falls back to Auth when local verification is not
  // available; route-level authorization remains in lib/supabase-user.ts.
  try {
    await getVerifiedClaims(supabase);
  } catch {
    // ignore: middleware must not fail closed on auth errors
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
