import { supabaseAdmin } from "@/lib/supabase";
import { issueLookupToken } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "candidates-lookup", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const body = await request.json().catch(() => null);
  const raw = typeof body?.email === "string" ? body.email : "";
  if (raw.length > 320) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }
  try {
    const db = supabaseAdmin();
    const lookup = db
      .from("candidates")
      .select("id")
      .eq("contact_email", email)
      .eq("visibility_status", "visible")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await lookup;
    if (error) throw error;
    const row = data as { id: string } | null;
    if (!row?.id) return Response.json({ exists: false });
    const token = issueLookupToken(row.id, email);
    if (!token) {
      return Response.json({ error: "Lookup failed. Try again." }, { status: 500 });
    }
    return Response.json({ exists: true, token });
  } catch {
    return Response.json({ error: "Lookup failed. Try again." }, { status: 500 });
  }
}
