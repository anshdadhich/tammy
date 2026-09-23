import { supabaseAdmin } from "@/lib/supabase";
import { AuthError, requireRole } from "@/lib/auth";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALUES = ["pending", "verified", "rejected", "suspended", "all"] as const;

// GET /api/admin/employers?status=pending — list employers (default pending).
// Admin-only (users.role === 'admin').
export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return Response.json({ error: (e as Error).message }, { status });
  }
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status") ?? "pending";
  const statusFilter = (STATUS_VALUES as readonly string[]).includes(rawStatus) ? rawStatus : "pending";
  const rawLimit = Number(url.searchParams.get("limit") ?? 100);
  const pageLimit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 100, 1), 100);
  const db = supabaseAdmin();
  let query = db
    .from("employers")
    .select(
      "id, user_id, company_name, company_email, website, company_size, industry, verification_status, created_at, updated_at",
    )
    .order("created_at", { ascending: true })
    .limit(pageLimit);
  if (statusFilter !== "all") {
    query = query.eq("verification_status", statusFilter);
  }
  const { data, error } = await query;
  if (error) {
    console.error("[admin] employers list failed");
    return Response.json({ error: "employers list failed" }, { status: 500 });
  }

  // Attach account emails (best-effort).
  const rows = (data ?? []) as Record<string, unknown>[];
  const userIds = [...new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean))];
  const emailByUser: Record<string, string> = {};
  if (userIds.length) {
    const { data: users } = await db.from("users").select("id, email").in("id", userIds);
    for (const u of (users ?? []) as { id: string; email: string }[]) {
      emailByUser[u.id] = u.email;
    }
  }
  return Response.json({
    employers: rows.map((r) => ({
      ...r,
      account_email: emailByUser[String(r.user_id ?? "")] ?? null,
    })),
  });
}

// POST /api/admin/employers { employerId, action: 'verify' | 'reject' }
// verify -> verification_status='verified', reject -> 'rejected'. Admin-only.
export async function POST(request: Request) {
  try {
    await requireRole("admin");
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return Response.json({ error: (e as Error).message }, { status });
  }
  const body = await request.json().catch(() => null);
  const parsed = z.object({ employerId: z.string().regex(UUID_RE), action: z.enum(["verify", "reject"]) }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const { employerId, action } = parsed.data;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("employers")
    .update({
      verification_status: action === "verify" ? "verified" : "rejected",
    })
    .eq("id", employerId)
    .select("id, company_name, verification_status")
    .single();
  if (error || !data) {
    console.error("[admin] employer update failed");
    return Response.json({ error: "employer not found" }, { status: 404 });
  }

  try {
    await db.from("audit_logs").insert({
      action: action === "verify" ? "employer_verified" : "employer_rejected",
      target_type: "employer",
      target_id: employerId,
      metadata: { company_name: (data as { company_name?: string })?.company_name ?? null },
    });
  } catch {
    // audit is best-effort
  }
  return Response.json({ employer: data });
}
