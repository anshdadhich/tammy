import { supabaseServer } from "@/lib/supabase-server";
import { ensureUserRow } from "@/lib/auth-link";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { redactPii } from "@/lib/redact";

/**
 * POST /api/auth/link — no body.
 * Completes implicit-flow (#access_token) logins: the browser already stored
 * the session via setSession() (see AuthHashHandler), so cookies are present
 * here. We just ensure the public.users row exists.
 */
export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "auth-link", limit: 20, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  try {
    const supabase = await supabaseServer();
    // This endpoint only needs the verified identity to create the app row.
    // getUser() adds an Auth API round trip after the browser has already
    // established the session; getClaims() validates the cookie token and is
    // local for projects using asymmetric signing keys.
    const { data, error } = await supabase.auth.getClaims();
    if (error) throw error;
    const id = data?.claims?.sub;
    const email = data?.claims?.email ?? data?.claims?.user_metadata?.email;
    if (typeof id !== "string" || typeof email !== "string" || !email.includes("@")) {
      return Response.json({ error: "No session." }, { status: 401 });
    }
    await ensureUserRow(id, email);
    return Response.json({ ok: true, email: email.trim().toLowerCase() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-link] failed detail=${redactPii(msg.slice(0, 200))}`);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
