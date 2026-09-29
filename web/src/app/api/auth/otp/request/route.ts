import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { siteUrlFor } from "@/lib/auth-link";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { redactPii } from "@/lib/redact";
import { readJsonBody } from "@/lib/http";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
  next: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "auth-otp-request", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const read = await readJsonBody(request, 4 * 1024);
  if (!read.ok) return Response.json({ ok: true });
  const body = read.body;
  const parsed = bodySchema.safeParse(body);
  const email = parsed.success ? parsed.data.email.trim().toLowerCase() : null;
  if (email) {
    const rlEmail = rateLimit(request, {
      key: "auth-otp-request-email",
      limit: 10,
      windowMs: 10 * 60_000,
      principal: email,
    });
    if (!rlEmail.ok) return rateLimitResponse(rlEmail.retryAfterMs);
  }
  if (!email || email.length > 320) {
    return Response.json({ ok: true });
  }
  try {
    const db = supabaseAdmin();
    // Route magiclink clicks to /auth/confirm so the session is exchanged
    // into cookies. Without emailRedirectTo Supabase points the link at "/",
    // which leaves #access_token in the hash and the user logged out.
    // `next` is allow-listed to same-origin "/" paths only.
    let next = "/";
    if (parsed.success && typeof parsed.data.next === "string") {
      const n = parsed.data.next.trim();
      if (n.startsWith("/") && !n.startsWith("//") && !n.includes("\\")) {
        next = n.slice(0, 200);
      }
    }
    const emailRedirectTo = `${siteUrlFor(request)}/auth/confirm?next=${encodeURIComponent(next)}`;
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo },
    });
    if (error) throw error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-otp-request] send failed detail=${redactPii(msg.slice(0, 200))}`);
  }
  return Response.json({ ok: true });
}
