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
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user?.id || !user.email?.includes("@")) {
      return Response.json({ error: "No session." }, { status: 401 });
    }
    await ensureUserRow(user.id, user.email);
    return Response.json({ ok: true, email: user.email.trim().toLowerCase() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-link] failed detail=${redactPii(msg.slice(0, 200))}`);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
