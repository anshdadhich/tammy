import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ensureUserRow, safeNextPath, siteUrlFor } from "@/lib/auth-link";
import { redactPii } from "@/lib/redact";

/**
 * GET /auth/confirm?code=...&next=/hire/search
 * GET /auth/confirm?token_hash=...&type=email&next=/...
 *
 * Supabase magiclinks / email links land here (see emailRedirectTo in
 * /api/auth/otp/request). Exchanges the code for a session cookie, ensures
 * the public.users row, then redirects to a safe same-origin `next`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeNextPath(url.searchParams.get("next"), "/");
  const origin = siteUrlFor(request);

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/hire/login?error=${encodeURIComponent(reason)}`, origin),
    );

  try {
    const supabase = await supabaseServer();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      const allowed = new Set(["email", "magiclink", "recovery", "signup", "invite"]);
      if (!allowed.has(type)) return fail("invalid_link");
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "email",
      });
      if (error) throw error;
    } else {
      return fail("invalid_link");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id || !user.email?.includes("@")) return fail("invalid_link");

    try {
      await ensureUserRow(user.id, user.email);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[auth-confirm] link failed detail=${redactPii(msg.slice(0, 200))}`);
      // Session cookie is already set; user can still proceed.
    }

    return NextResponse.redirect(new URL(next, origin));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-confirm] exchange failed detail=${redactPii(msg.slice(0, 200))}`);
    return fail("expired_link");
  }
}
