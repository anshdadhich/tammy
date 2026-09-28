import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { redactPii } from "@/lib/redact";
import { readJsonBody } from "@/lib/http";

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
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
    const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[auth-otp-request] send failed detail=${redactPii(msg.slice(0, 200))}`);
  }
  return Response.json({ ok: true });
}
