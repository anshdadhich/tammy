import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getVerifiedClaims } from "@/lib/supabase-claims";
import { ensureUserRow, safeNextPath } from "@/lib/auth-link";
import { redactPii } from "@/lib/redact";
import ConfirmHashClient from "./confirm-hash-client";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const OTP_TYPES = new Set(["email", "magiclink", "recovery", "signup", "invite"]);

/**
 * GET /auth/confirm — handles BOTH Supabase link formats:
 * - PKCE/query links (?code= or ?token_hash=&type=): exchanged server-side
 *   into session cookies here.
 * - Implicit/hash links (#access_token=&refresh_token=): the fragment never
 *   reaches the server, so we render a client step that converts it instead
 *   of bouncing with invalid_link.
 */
export default async function AuthConfirmPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const code = first(sp.code);
  const tokenHash = first(sp.token_hash);
  const type = first(sp.type);
  const next = safeNextPath(first(sp.next), "/");

  if (code || (tokenHash && type)) {
    try {
      const supabase = await supabaseServer();
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else {
        if (!OTP_TYPES.has(type as string)) redirect("/hire/login?error=invalid_link");
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash as string,
          type: type as "email",
        });
        if (error) throw error;
      }
      const { data: claimsData, error: claimsError } = await getVerifiedClaims(supabase);
      if (claimsError) throw claimsError;
      const userId = claimsData?.claims?.sub;
      const email = claimsData?.claims?.email ?? claimsData?.claims?.user_metadata?.email;
      if (typeof userId !== "string" || typeof email !== "string" || !email.includes("@")) {
        redirect("/hire/login?error=invalid_link");
      }
      try {
        await ensureUserRow(userId, email);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[auth-confirm] link failed detail=${redactPii(msg.slice(0, 200))}`);
        // Session cookie is already set; user can still proceed.
      }
      redirect(next);
    } catch (e) {
      if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[auth-confirm] exchange failed detail=${redactPii(msg.slice(0, 200))}`);
      redirect("/hire/login?error=expired_link");
    }
  }

  // No query code: either an implicit #access_token link (handled client-side
  // below) or a direct visit (client redirects to login with invalid_link).
  return <ConfirmHashClient next={next} />;
}
