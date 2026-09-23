import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// Public client (anon, RLS-enforced) for one-off browser use.
// NOTE: for login/signup/verify/admin pages prefer supabaseBrowser()
// (cookie-synced, visible to server helpers). Kept for backend fallbacks
// and non-auth reads.
export function supabasePublic() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Service-role client (bypasses RLS) — route handlers / Inngest only, never browser.
export function supabaseAdmin() {
  // Hard guard: importing this module client-side would bundle the service key.
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() must only run on the server");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Cookie-synced browser client (RLS-enforced). Writes session to cookies
// so server helpers can read it. Use in all "use client" pages.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
