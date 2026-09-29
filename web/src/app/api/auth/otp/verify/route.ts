import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureUserRow } from "@/lib/auth-link";
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
  return ensureUserRow(uid, email);
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
