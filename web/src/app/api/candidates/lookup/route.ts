import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "candidates-lookup", limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("candidates")
      .select("id")
      .ilike("contact_email", email)
      .eq("visibility_status", "visible")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = data as { id: string } | null;
    if (row?.id) return Response.json({ exists: true, id: row.id });
    return Response.json({ exists: false });
  } catch {
    return Response.json({ error: "Lookup failed. Try again." }, { status: 500 });
  }
}
