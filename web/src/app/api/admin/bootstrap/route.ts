import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rl = rateLimit(request, { key: "admin-bootstrap", limit: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.toLowerCase().trim();
  if (!email || !email.includes("@")) {
    return Response.json({ error: "provide ?email=you@example.com (must have signed up first)" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: existing } = await db.from("users").select("id").eq("role", "admin").limit(1);
  if (existing && existing.length > 0) {
    return Response.json({ error: "bootstrap closed — an admin already exists" }, { status: 403 });
  }
  const requiredSecret = process.env.BOOTSTRAP_SECRET;
  if (requiredSecret) {
    const token = url.searchParams.get("token") ?? "";
    if (token !== requiredSecret) {
      return Response.json({ error: "bootstrap closed — invalid token" }, { status: 403 });
    }
  } else {
    console.warn("[admin] BOOTSTRAP_SECRET not set — bootstrap open until first admin");
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
