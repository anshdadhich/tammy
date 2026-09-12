import { supabaseAdmin } from "@/lib/supabase";

// GET /api/stats — public pool counters for the landing ticker.
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { count } = await db
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("visibility_status", "visible");
    return Response.json({ visibleCandidates: count ?? 0 });
  } catch {
    return Response.json({ visibleCandidates: 0 });
  }
}
