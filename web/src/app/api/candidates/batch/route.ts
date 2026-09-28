import { userDb, requireHrDb, getSessionUser } from "@/lib/supabase-user";
import { applyContactPrefs } from "@/lib/contact-prefs";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX_JSON_BYTES = 256 * 1024;

const BASE_COLS = "id, full_name, headline, current_position, domain, total_experience_years, location_city, photo_url, visibility_status";
const PREF_COLS = "show_email, show_phone, show_linkedin, show_github, show_portfolio, show_resume, show_photo";
const CONTACT_COLS = "contact_email, contact_phone, linkedin_url, github_url, portfolio_url, resume_url";

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "candidates-batch", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const hr = await requireHrDb();
  if (hr instanceof Response) return hr;
  if (hr.user.viewer.kind !== "hr") {
    return Response.json({ error: "Employer session required." }, { status: 401 });
  }

  const ct = request.headers.get("content-type") ?? "";
  if (ct && !ct.toLowerCase().includes("application/json")) {
    return Response.json({ error: "content-type must be application/json" }, { status: 415 });
  }
  const lenRaw = request.headers.get("content-length");
  if (lenRaw !== null && Number.isFinite(Number(lenRaw)) && Number(lenRaw) > MAX_JSON_BYTES) {
    return Response.json({ error: "request body too large" }, { status: 413 });
  }
  let text = "";
  try {
    text = await request.text();
  } catch {
    return Response.json({ candidates: [] });
  }
  if (text && Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    return Response.json({ error: "request body too large" }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return Response.json({ candidates: [] });
  }
  const raw = Array.isArray((body as { ids?: unknown } | null)?.ids) ? (body as { ids: unknown[] }).ids : [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(raw.filter((x: unknown): x is string => typeof x === "string" && uuidRe.test(x)))].slice(0, 50);
  if (!ids.length) return Response.json({ candidates: [] });

  const db = await userDb();
  let data: Record<string, unknown>[] | null = null;
  let degraded = false;
  {
    const full = await db
      .from("candidates")
      .select(`${BASE_COLS}, ${PREF_COLS}, ${CONTACT_COLS}`)
      .in("id", ids)
      .eq("visibility_status", "visible");
    if (full.error && /could not find the|column .* does not exist|PGRST204/i.test(full.error.message ?? "")) {
      degraded = true;
      const fallback = await db
        .from("candidates")
        .select(BASE_COLS)
        .in("id", ids)
        .eq("visibility_status", "visible");
      if (fallback.error) return Response.json({ error: "batch query failed" }, { status: 500 });
      data = (fallback.data ?? []) as Record<string, unknown>[];
    } else if (full.error) {
      return Response.json({ error: "batch query failed" }, { status: 500 });
    } else {
      data = (full.data ?? []) as Record<string, unknown>[];
    }
  }

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
  const rows = (data ?? []) as (Row & Record<string, unknown>)[];
  const candidates = rows.map((r) => {
    const scrubbed = applyContactPrefs(r as Parameters<typeof applyContactPrefs>[0]) as unknown as Record<string, unknown>;
    const photoRaw = scrubbed.photo_url ?? (degraded ? null : r.photo_url);
    return {
      id: r.id,
      name: r.full_name ?? "",
      headline: r.headline ?? r.current_position ?? "",
      meta: [r.domain, r.total_experience_years != null ? `${r.total_experience_years}y` : null, r.location_city]
        .filter(Boolean)
        .join(" · "),
      photo: typeof photoRaw === "string" && /^https?:\/\//i.test(photoRaw) ? photoRaw : null,
    };
  });
  if (degraded) {
    return Response.json({ candidates, contactPrefsDegraded: true });
  }
  return Response.json({ candidates });
}
