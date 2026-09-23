import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-aware server client (RLS-enforced, acts as the signed-in user).
// Server-only: importing next/headers keeps this out of client bundles.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
            // Server Component: cookies are read-only here (the session
            // middleware that once refreshed them has been removed).
          }
        },
      },
    },
  );
}
