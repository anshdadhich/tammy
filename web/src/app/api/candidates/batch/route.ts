import { supabaseAdmin } from "@/lib/supabase";
import { getViewer, requireHr } from "@/lib/api-auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "candidates-batch", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const denied = requireHr(getViewer(request));
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.ids) ? body.ids : [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(raw.filter((x: unknown): x is string => typeof x === "string" && uuidRe.test(x)))].slice(0, 50);
  if (!ids.length) return Response.json({ candidates: [] });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("candidates")
    .select(
      "id, full_name, headline, current_position, domain, total_experience_years, location_city, photo_url, visibility_status",
    )
    .in("id", ids)
    .eq("visibility_status", "visible");

  if (error) return Response.json({ error: "batch query failed" }, { status: 500 });

  type Row = {
    id: string;
    full_name: string | null;
    headline: string | null;
    current_position: string | null;
    domain: string | null;
    total_experience_years: number | null;
    location_city: string | null;
    photo_url: string | null;
  };
  const rows = (data ?? []) as Row[];
  const candidates = rows.map((r) => ({
    id: r.id,
    name: r.full_name ?? "",
    headline: r.headline ?? r.current_position ?? "",
    meta: [r.domain, r.total_experience_years != null ? `${r.total_experience_years}y` : null, r.location_city]
      .filter(Boolean)
      .join(" · "),
    photo: typeof r.photo_url === "string" && /^https?:\/\//i.test(r.photo_url) ? r.photo_url : null,
  }));
  return Response.json({ candidates });
}
