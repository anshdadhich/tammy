import { supabaseAdmin } from "@/lib/supabase";

export const PLAN_LIMITS = { free: 25, basic: 500, pro: 2000 } as const;
export type PlanName = keyof typeof PLAN_LIMITS;

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function checkSearchQuota(
  employerId: string,
): Promise<{ ok: boolean; used: number; limit: number; plan: PlanName }> {
  const db = supabaseAdmin();
  const now = new Date();
  const cycleStart = monthStart(now).toISOString();
  let plan: PlanName = "free";
  let limit: number = PLAN_LIMITS.free;
  try {
    const { data } = await db
      .from("employer_quotas")
      .select("plan, search_limit, cycle_started_at")
      .eq("employer_id", employerId)
      .maybeSingle();
    const row = data as { plan: string; search_limit: number; cycle_started_at: string } | null;
    if (!row) {
      await db.from("employer_quotas").upsert(
        { employer_id: employerId, plan: "free", search_limit: PLAN_LIMITS.free, cycle_started_at: cycleStart },
        { onConflict: "employer_id", ignoreDuplicates: true },
      );
    } else {
      plan = (["free", "basic", "pro"] as const).includes(row.plan as PlanName)
        ? (row.plan as PlanName)
        : "free";
      limit = typeof row.search_limit === "number" ? row.search_limit : PLAN_LIMITS[plan];
      if (row.cycle_started_at < cycleStart) {
        await db.from("employer_quotas").update({ cycle_started_at: cycleStart }).eq("employer_id", employerId);
      }
    }
  } catch {
  }
  let used = 0;
  try {
    const { count } = await db
      .from("searches")
      .select("id", { count: "exact", head: true })
      .eq("employer_id", employerId)
      .gte("created_at", cycleStart);
    used = count ?? 0;
  } catch {
  }
  return { ok: used < limit, used, limit, plan };
}

export async function setEmployerPlan(employerId: string, plan: PlanName): Promise<boolean> {
  const db = supabaseAdmin();
  const now = new Date();
  try {
    const { error } = await db.from("employer_quotas").upsert(
      {
        employer_id: employerId,
        plan,
        search_limit: PLAN_LIMITS[plan],
        cycle_started_at: monthStart(now).toISOString(),
      },
      { onConflict: "employer_id" },
    );
    return !error;
  } catch {
    return false;
  }
}
