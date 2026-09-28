import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-user";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/validators";

const bodySchema = z.object({
  company_name: z.string().trim().min(2).max(200),
  company_email: z.string().trim().email().max(320).optional(),
  website: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "employers-register", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const session = await getSessionUser();
  if (!session || !session.userRow) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }
  if (session.userRow.role === "admin") {
    return Response.json({ error: "Admins cannot register as employers." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("employers")
    .select("id, verification_status")
    .eq("user_id", session.userRow.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = existing as { id: string; verification_status: string } | null;
  if (row?.id) {
    return Response.json({ employerId: row.id, status: row.verification_status });
  }
  const companyEmail = parsed.data.company_email ? normalizeEmail(parsed.data.company_email) : "";
  const { data: created, error } = await db
    .from("employers")
    .insert({
      user_id: session.userRow.id,
      company_name: parsed.data.company_name,
      company_email: companyEmail || session.email,
      website: parsed.data.website || null,
      verification_status: "pending",
    })
    .select("id")
    .single();
  if (error || !created) {
    return Response.json({ error: "Could not register company." }, { status: 500 });
  }
  const employerId = (created as { id: string }).id;
  if (session.userRow.role === "candidate") {
    await db.from("users").update({ role: "employer" }).eq("id", session.userRow.id);
  }
  return Response.json({ employerId, status: "pending" }, { status: 201 });
}
