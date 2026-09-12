import { supabaseAdmin } from "@/lib/supabase";

// GET /api/admin/bootstrap?email=you@example.com
// First-run only: if NO admin exists yet, promotes that email to admin.
// Closed (403) once any admin exists. No SQL needed.
export async function GET(request: Request) {
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
  const { data, error } = await db
    .from("users")
    .update({ role: "admin" })
    .eq("email", email)
    .select("id, email, role")
    .single();
  if (!data) {
    return Response.json({ error: "email not found — sign up first", detail: error?.message ?? null }, { status: 404 });
  }
  return Response.json({ ok: true, admin: data });
}
