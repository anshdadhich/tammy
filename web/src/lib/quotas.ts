import { supabaseAdmin } from "@/lib/supabase";

export const PLAN_LIMITS = { free: 25, basic: 500, pro: 2000 } as const;
export type PlanName = keyof typeof PLAN_LIMITS;

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function isMissingRelation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code ?? "";
  return code === "42P01" || code === "42703" || /PGRST205/i.test(msg) || /does not exist|Could not find the table/i.test(msg);
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
    const { data, error } = await db
      .from("employer_quotas")
      .select("plan, search_limit, cycle_started_at")
      .eq("employer_id", employerId)
      .maybeSingle();
    if (error) throw error;
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
        const { error: cycleErr } = await db.from("employer_quotas").update({ cycle_started_at: cycleStart }).eq("employer_id", employerId);
        if (cycleErr) throw cycleErr;
      }
    }
  } catch (e) {
    if (isMissingRelation(e)) {
      console.error("[quotas] employer_quotas table missing — run migrations; allowing search");
      return { ok: true, used: 0, limit, plan };
    }
    console.error("[quotas] quota read failed — failing closed");
    return { ok: false, used: limit, limit, plan };
  }
  let used = 0;
  try {
    const { count, error: countErr } = await db
      .from("searches")
      .select("id", { count: "exact", head: true })
      .eq("employer_id", employerId)
      .gte("created_at", cycleStart);
    if (countErr) throw countErr;
    used = count ?? 0;
  } catch (e) {
    if (isMissingRelation(e)) {
      console.error("[quotas] searches table missing — allowing search");
      return { ok: true, used: 0, limit, plan };
    }
    console.error("[quotas] usage read failed — failing closed");
    return { ok: false, used: limit, limit, plan };
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
