import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const MAX_EMAIL_LEN = 320;

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length || ab.length === 0) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export async function GET() {
  return Response.json(
    { error: "Use POST /api/admin/bootstrap with the bootstrap secret in the x-bootstrap-secret header." },
    { status: 405 },
  );
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "admin-bootstrap", limit: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const requiredSecret = process.env.BOOTSTRAP_SECRET;
  if (!requiredSecret) {
    return Response.json(
      { error: "bootstrap closed — server not configured" },
      { status: 403 },
    );
  }
  const headerSecret = request.headers.get("x-bootstrap-secret") ?? "";
  const body = await request.json().catch(() => null);
  const bodySecret = typeof body?.token === "string" ? body.token : "";
  const provided = headerSecret || bodySecret;
  if (!provided || !secretsEqual(provided, requiredSecret)) {
    return Response.json({ error: "bootstrap closed — invalid token" }, { status: 403 });
  }
  const rawEmail =
    (typeof body?.email === "string" && body.email) ||
    new URL(request.url).searchParams.get("email") ||
    "";
  if (rawEmail.length > MAX_EMAIL_LEN) {
    return Response.json({ error: "provide a valid email that has signed up first" }, { status: 400 });
  }
  const email = rawEmail.toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "provide a valid email that has signed up first" }, { status: 400 });
  }
  const allowlisted = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").toLowerCase().trim();
  if (allowlisted && !secretsEqual(email, allowlisted)) {
    return Response.json({ error: "bootstrap closed for this email" }, { status: 403 });
  }
  const db = supabaseAdmin();
  const existing = await db.from("users").select("id").eq("role", "admin").limit(1);
  if (existing.error) {
    return Response.json({ error: "bootstrap closed — try again" }, { status: 403 });
  }
  const rows = existing.data as { id: string }[] | null;
  if (rows && rows.length > 0) {
    return Response.json({ error: "bootstrap closed — an admin already exists" }, { status: 403 });
  }
  const { data } = await db
    .from("users")
    .update({ role: "admin" })
    .eq("email", email)
    .select("id, email, role")
    .single();
  if (!data) {
    return Response.json({ error: "email not found — sign up first" }, { status: 404 });
  }
  return Response.json({ ok: true, admin: data });
}
