import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { supabaseServer } from "@/lib/supabase-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { redactPii } from "@/lib/redact";
import { readJsonBody } from "@/lib/http";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  token: z.string().trim().min(6).max(64),
});

const GENERIC_ERROR = "Invalid email or code.";

function normalizeToken(v: string): string {
  return v.trim().replace(/\s+/g, "");
}

async function linkUserRow(uid: string, email: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: byAuth, error: authErr } = await db
    .from("users")
    .select("id, email, auth_id")
    .eq("auth_id", uid)
    .maybeSingle();
  if (authErr) throw authErr;
  const authRow = byAuth as { id: string; email: string; auth_id: string | null } | null;
  if (authRow?.id) {
    if (typeof authRow.email === "string" && authRow.email.toLowerCase() !== email) {
      const { data: clash, error: clashErr } = await db
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (clashErr) throw clashErr;
      const clashRow = clash as { id: string } | null;
      if (!clashRow || clashRow.id === authRow.id) {
        const { error: updErr } = await db
          .from("users")
          .update({ email, email_verified: true })
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
    .eq("email", email)
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
    .insert({ email, auth_id: uid, role: "candidate", email_verified: true });
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      const { data: retry, error: retryErr } = await db
        .from("users")
        .select("id, auth_id")
        .eq("email", email)
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

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "auth-otp-verify", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const read = await readJsonBody(request, 4 * 1024);
  if (!read.ok) return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  const body = read.body;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (email.length > 320) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  const rlEmail = rateLimit(request, {
    key: "auth-otp-verify-email",
    limit: 10,
    windowMs: 10 * 60_000,
    principal: email,
  });
  if (!rlEmail.ok) return rateLimitResponse(rlEmail.retryAfterMs);
  const token = normalizeToken(parsed.data.token);
  if (token.length < 6 || token.length > 64) {
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  let uid: string | null = null;
  let authEmail = email;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
    const au = data.user;
    if (!au || !au.id) throw new Error("verify returned no user");
    uid = au.id;
    if (typeof au.email === "string" && au.email.includes("@")) {
      authEmail = au.email.trim().toLowerCase();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-otp-verify] verify failed detail=${redactPii(msg.slice(0, 200))}`);
    return Response.json({ error: GENERIC_ERROR }, { status: 400 });
  }
  try {
    await linkUserRow(uid, authEmail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-otp-verify] link failed detail=${redactPii(msg.slice(0, 200))}`);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  try {
    const db = supabaseAdmin();
    const { data: userRow } = await db.from("users").select("id").eq("auth_id", uid).maybeSingle();
    const userId = (userRow as { id: string } | null)?.id ?? null;
    if (userId) {
      const { data: orphans } = await db
        .from("candidates")
        .select("id")
        .eq("contact_email", authEmail)
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const orphanId = ((orphans ?? []) as { id: string }[])[0]?.id ?? null;
      if (orphanId) {
        await db.from("candidates").update({ user_id: userId }).eq("id", orphanId).is("user_id", null);
      }
    }
  } catch {
  }
  return Response.json({ ok: true, email: authEmail });
}
