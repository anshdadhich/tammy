import { z } from "zod";
import { issueEmailChangeToken } from "@/lib/api-auth";
import { getSessionUser, requireOwnerDb } from "@/lib/supabase-user";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/validators";
import { supabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({
  id: z.string().uuid(),
  newEmail: z.string().trim().email().max(320),
});

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "session-email-change", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const session = await getSessionUser();
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  if (!session || session.viewer.kind !== "owner" || session.viewer.id !== parsed.data.id) {
    return Response.json({ error: "Sign in as this profile owner first." }, { status: 403 });
  }
  const gate = await requireOwnerDb(parsed.data.id);
  if (gate instanceof Response) {
    return Response.json({ error: "Sign in as this profile owner first." }, { status: 403 });
  }
  const newEmail = normalizeEmail(parsed.data.newEmail);
  if (!newEmail || newEmail.length > 320) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: row } = await db
    .from("candidates")
    .select("contact_email")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const current = normalizeEmail((row as { contact_email?: unknown } | null)?.contact_email ?? "");
  if (!newEmail || newEmail === current) {
    return Response.json({ error: "That is already the email on this profile." }, { status: 400 });
  }
  const clash = await db.from("users").select("id").eq("email", newEmail).maybeSingle();
  if ((clash.data as { id: string } | null)?.id) {
    return Response.json({ error: "That email is already in use." }, { status: 409 });
  }
  const token = issueEmailChangeToken(parsed.data.id, newEmail);
  if (!token) {
    return Response.json({ error: "Try again shortly." }, { status: 503 });
  }
  return Response.json({ token });
}
