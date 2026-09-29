import { supabaseAdmin } from "@/lib/supabase";
import { AuthError, requireRole } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { z } from "zod";
import { readJsonBody } from "@/lib/http";
import { PLAN_LIMITS, setEmployerPlan, type PlanName } from "@/lib/quotas";
import { listAdminEmployers } from "@/lib/admin-employers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_VALUES = ["pending", "verified", "rejected", "suspended", "all"] as const;

export async function GET(request: Request) {
  const rl = rateLimit(request, { key: "admin-employers-get", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
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
  try {
    const employers = await listAdminEmployers(
      statusFilter as (typeof STATUS_VALUES)[number],
      pageLimit,
    );
    return Response.json({ employers });
  } catch {
    console.error("[admin] employers list failed");
    return Response.json({ error: "employers list failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { key: "admin-employers-post", limit: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  try {
    await requireRole("admin");
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return Response.json({ error: (e as Error).message }, { status });
  }
  const read = await readJsonBody(request, 4 * 1024);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = z.object({
    employerId: z.string().regex(UUID_RE),
    action: z.enum(["verify", "reject", "set_plan"]),
    plan: z.enum(["free", "basic", "pro"]).optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const { employerId, action } = parsed.data;
  const db = supabaseAdmin();
  if (action === "set_plan") {
    if (!parsed.data.plan || !(parsed.data.plan in PLAN_LIMITS)) {
      return Response.json({ error: "plan must be free, basic, or pro" }, { status: 400 });
    }
    const ok = await setEmployerPlan(employerId, parsed.data.plan as PlanName);
    if (!ok) return Response.json({ error: "plan update failed" }, { status: 500 });
    return Response.json({ employerId, plan: parsed.data.plan });
  }
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
  }
  return Response.json({ employer: data });
}
