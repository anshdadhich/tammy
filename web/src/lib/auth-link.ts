import { supabaseAdmin } from "@/lib/supabase";

/**
 * Ensure a `public.users` row exists for a Supabase Auth user.
 * Shared by OTP-code verify (server) and magiclink confirm flows so both
 * paths leave the DB in the same state.
 */
export async function ensureUserRow(uid: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!uid || !normalized || !normalized.includes("@")) return;
  const db = supabaseAdmin();
  const { data: byAuth, error: authErr } = await db
    .from("users")
    .select("id, email, auth_id")
    .eq("auth_id", uid)
    .maybeSingle();
  if (authErr) throw authErr;
  const authRow = byAuth as { id: string; email: string; auth_id: string | null } | null;
  if (authRow?.id) {
    if (typeof authRow.email === "string" && authRow.email.toLowerCase() !== normalized) {
      const { data: clash, error: clashErr } = await db
        .from("users")
        .select("id")
        .eq("email", normalized)
        .maybeSingle();
      if (clashErr) throw clashErr;
      const clashRow = clash as { id: string } | null;
      if (!clashRow || clashRow.id === authRow.id) {
        const { error: updErr } = await db
          .from("users")
          .update({ email: normalized, email_verified: true })
          .eq("id", authRow.id);
        if (updErr) throw updErr;
      }
    } else {
      const { error: updErr } = await db
        .from("users")
        .update({ email_verified: true })
        .eq("id", authRow.id);
      if (updErr) throw updErr;
    }
    return;
  }
  const { data: byEmail, error: emailErr } = await db
    .from("users")
    .select("id, auth_id")
    .eq("email", normalized)
    .maybeSingle();
  if (emailErr) throw emailErr;
  const emailRow = byEmail as { id: string; auth_id: string | null } | null;
  if (emailRow?.id) {
    if (!emailRow.auth_id) {
      const { error: updErr } = await db
        .from("users")
        .update({ auth_id: uid, email_verified: true })
        .eq("id", emailRow.id);
      if (updErr) throw updErr;
    }
    return;
  }
  const { error: insErr } = await db
    .from("users")
    .insert({ email: normalized, auth_id: uid, role: "candidate", email_verified: true });
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      const { data: retry, error: retryErr } = await db
        .from("users")
        .select("id, auth_id")
        .eq("email", normalized)
        .maybeSingle();
      if (retryErr) throw retryErr;
      const retryRow = retry as { id: string; auth_id: string | null } | null;
      if (retryRow?.id && !retryRow.auth_id) {
        const { error: linkErr } = await db
          .from("users")
          .update({ auth_id: uid, email_verified: true })
          .eq("id", retryRow.id);
        if (linkErr) throw linkErr;
      }
      return;
    }
    throw insErr;
  }
}

/** Only allow same-origin relative redirects. Falls back to `fallback`. */
export function safeNextPath(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//") && !decoded.includes("\\")) {
      return decoded.slice(0, 500);
    }
  } catch {
    // fall through
  }
  return fallback;
}

/** Absolute site URL for email redirects. Prefers NEXT_PUBLIC_SITE_URL, else request origin. */
export function siteUrlFor(request?: Request): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (fromEnv) {
    try {
      const u = new URL(fromEnv);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      // fall through to request origin
    }
  }
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      // fall through
    }
  }
  return process.env.NODE_ENV === "production" ? "https://example.com" : "http://localhost:3000";
}
