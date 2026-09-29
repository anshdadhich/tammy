import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-user";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/validators";
import { readJsonBody } from "@/lib/http";

const bodySchema = z.object({
  company_name: z.string().trim().min(2).max(200),
  company_email: z.string().trim().email().max(320).optional(),
  website: z.string().trim().max(500),
  linkedin_url: z.string().trim().max(500),
});

function validWebsite(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

function validLinkedin(v: string): boolean {
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (!u.hostname.toLowerCase().endsWith("linkedin.com")) return false;
    return u.pathname.trim().replace(/\//g, "").length > 0;
  } catch {
    return false;
  }
}

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
  const read = await readJsonBody(request, 16 * 1024);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  if (!validWebsite(parsed.data.website)) {
    return Response.json({ error: "Enter a valid company website URL." }, { status: 400 });
  }
  if (!validLinkedin(parsed.data.linkedin_url)) {
    return Response.json({ error: "Enter a valid LinkedIn profile or company URL." }, { status: 400 });
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
  const rowBase = {
    user_id: session.userRow.id,
    company_name: parsed.data.company_name,
    company_email: companyEmail || session.email,
    website: parsed.data.website,
    verification_status: "pending",
  };
  let created: { id: string } | null = null;
  {
    const full = await db
      .from("employers")
      .insert({ ...rowBase, linkedin_url: parsed.data.linkedin_url })
      .select("id")
      .single();
    if (!full.error) {
      created = (full.data as { id: string } | null) ?? null;
    } else if (/could not find the|column .* does not exist|PGRST204/i.test(full.error.message ?? "")) {
      const legacy = await db.from("employers").insert(rowBase).select("id").single();
      if (!legacy.error) created = (legacy.data as { id: string } | null) ?? null;
    } else {
      return Response.json({ error: "Could not register company." }, { status: 500 });
    }
  }
  if (!created) {
    return Response.json({ error: "Could not register company." }, { status: 500 });
  }
  const employerId = created.id;
  if (session.userRow.role === "candidate") {
    await db.from("users").update({ role: "employer" }).eq("id", session.userRow.id);
  }
  return Response.json({ employerId, status: "pending" }, { status: 201 });
}
