import { supabaseAdmin } from "@/lib/supabase";
import { jobSchema } from "@/lib/validators";
import type { JobReq } from "@/lib/matching/types";
import { buildJobQueryText, embedQuery } from "@/lib/matching/voyage";
import { applyContactPrefs } from "@/lib/contact-prefs";
import { defaultOpenAIProvider, judgeTop, type JudgeInput } from "@/lib/matching/judge";
import { blendWithJudge, scoreCandidate, type ScoreContext } from "@/lib/scoring-live";
import { withWideEvent } from "@/lib/observe";

// POST /api/search { job, limit=30, deep=false }
// Qwen fixes: group chunks BY CANDIDATE (cap 3/candidate, best-distance wins),
// cache invalidated when candidate data changes after the cached search.
export const POST = withWideEvent("/api/search", async (request, wev) => {
  const body = await request.json().catch(() => null);
  const limit = Math.min(Math.max(body?.limit ?? 30, 1), 30);
  const deep = body?.deep === true;
  const parsed = jobSchema.safeParse(body?.job);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.flatten() }, { status: 400 });
  }
  const j = parsed.data as {
    title: string; domain?: string; seniority?: string;
    must_have?: string[]; nice_to_have?: string[];
    min_exp?: number; max_exp?: number;
    salary_min?: number; salary_max?: number;
    location?: string; remote_policy?: string;
    description?: string;
  };

  const jobReq: JobReq = {
    job_title: j.title,
    domain: j.domain,
    seniority: j.seniority,
    must_have_skills: j.must_have ?? [],
    nice_to_have_skills: j.nice_to_have ?? [],
    experience_min: j.min_exp ?? null,
    experience_max: j.max_exp ?? null,
    salary_min: j.salary_min ?? null,
    salary_max: j.salary_max ?? null,
    location: j.location ?? null,
    remote_allowed: j.remote_policy === "remote",
    core_responsibilities: j.description ? [j.description] : [],
    raw_description: j.description ?? j.title,
  };

  const queryText = buildJobQueryText(jobReq);
  const db = supabaseAdmin();
  wev.add({
    job_title: jobReq.job_title,
    domain: jobReq.domain ?? null,
    seniority: jobReq.seniority ?? null,
    must_have: jobReq.must_have_skills.length,
    limit,
    deep,
  });

  // Cache: same job text, 1h TTL, invalidated if any visible candidate changed since.
  if (!deep) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await db
        .from("searches")
        .select("id, created_at")
        .eq("query_text", queryText)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const rs = recent as { id: string; created_at: string } | null;
      if (rs?.id) {
        const { data: changed } = await db
          .from("candidates")
          .select("id")
          .eq("visibility_status", "visible")
          .gt("updated_at", rs.created_at)
          .limit(1);
        if (!changed?.length) {
          const { data: cached } = await db
            .from("candidate_matches")
            .select("candidate_id, score, match_reasons_json, candidates(id, full_name, headline, domain, total_experience_years, min_salary, contact_email, contact_phone, linkedin_url, github_url, portfolio_url, resume_url, photo_url, location_city)")
            .eq("search_id", rs.id)
            .limit(limit);
          if (cached?.length) {
            // Flatten to the exact shape the live path returns (flat candidate
            // fields + overall_score), so list rendering and caching behave
            // identically on cache hits and live searches.
            const flattened: Record<string, unknown>[] = (cached as Record<string, unknown>[])
              .map((m): Record<string, unknown> | null => {
                const mm = m as {
                  candidates?: Record<string, unknown> | null;
                  candidate_id?: unknown;
                  score?: unknown;
                  match_reasons_json?: unknown;
                };
                const c = mm.candidates;
                if (!c || typeof c !== "object") return null;
                const clean = applyContactPrefs(c as Parameters<typeof applyContactPrefs>[0]) as unknown as Record<string, unknown>;
                return {
                  ...clean,
                  id: c.id ?? mm.candidate_id,
                  overall_score: typeof mm.score === "number" ? mm.score : null,
                  sub_scores: (mm.match_reasons_json as Record<string, unknown> | null) ?? {},
                };
              })
              .filter((r): r is Record<string, unknown> => !!r?.id);
            if (flattened.length) {
              wev.add({ cached: true, result_count: flattened.length, search_id: rs.id });
              return Response.json({ results: flattened, queryText, searchId: rs.id, cached: true });
            }
          }
        }
      }
    } catch { /* cache miss — run live */ }
  }

  // Retrieve up to 200 chunks, then GROUP BY CANDIDATE (cap 3 each, best distance wins).
  type Chunk = { candidate_id: string; distance?: number; content_text?: string; chunk_type?: string };
  let chunks: Chunk[] = [];
  try {
    const qvec = await embedQuery(queryText);
    const { data, error } = await db.rpc("match_chunks", {
      query_embedding: `[${qvec.join(",")}]`,
      match_count: 200,
    });
    if (!error && data) chunks = data as Chunk[];
  } catch { /* fall back below */ }

  const CAND_COLS = "id, full_name, headline, domain, total_experience_years, min_salary, contact_email, contact_phone, linkedin_url, github_url, portfolio_url, resume_url, photo_url, profile_strength, remote_preference, location_city, availability_status";
  let rows: Record<string, unknown>[] = [];
  if (chunks.length) {
    const byCand = new Map<string, { best: number; hits: Chunk[] }>();
    for (const c of chunks) {
      if (!c.candidate_id) continue;
      const g = byCand.get(c.candidate_id) ?? { best: Infinity, hits: [] };
      const d = typeof c.distance === "number" ? c.distance : Infinity;
      if (d < g.best) g.best = d;
      // One candidate can't dominate via chunk count: keep its 3 nearest chunks.
      g.hits.push(c);
      g.hits.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      if (g.hits.length > 3) g.hits.length = 3;
      byCand.set(c.candidate_id, g);
    }
    const ranked = [...byCand.entries()].sort((a, b) => a[1].best - b[1].best).slice(0, limit);
    const ids = ranked.map(([id]) => id);
    if (ids.length) {
      const { data: cands } = await db
        .from("candidates")
        .select(CAND_COLS)
        .in("id", ids)
        .eq("visibility_status", "visible");
      const byId = new Map(((cands ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]));
      const grouped: Record<string, unknown>[] = [];
      for (const [id, g] of ranked) {
        const c = byId.get(id);
        if (c) grouped.push({ ...c, best_distance: g.best, matched_chunks: g.hits.length });
      }
      rows = grouped;
    }
    // Live transparent scoring: distance is only one of five votes.
    try {
      const scoreIds = rows.map((r) => String(r.id));
      const [{ data: skillRows }, { data: projRows }] = await Promise.all([
        db.from("candidate_skills").select("candidate_id, skills(name)").in("candidate_id", scoreIds),
        db.from("projects").select("id, candidate_id, tech_stack").in("candidate_id", scoreIds),
      ]);
      const skillsByCand = new Map<string, string[]>();
      for (const s of ((skillRows ?? []) as unknown as { candidate_id: string; skills: { name: string } | { name: string }[] | null }[])) {
        const list = Array.isArray(s.skills) ? s.skills : s.skills ? [s.skills] : [];
        for (const sk of list) {
          if (!sk?.name) continue;
          const arr = skillsByCand.get(s.candidate_id) ?? [];
          arr.push(sk.name);
          skillsByCand.set(s.candidate_id, arr);
        }
      }
      const projsByCand = new Map<string, { id: string; tech: string[] }[]>();
      for (const p of ((projRows ?? []) as { id: string; candidate_id: string; tech_stack: string[] | null }[])) {
        const arr = projsByCand.get(p.candidate_id) ?? [];
        arr.push({ id: p.id, tech: p.tech_stack ?? [] });
        projsByCand.set(p.candidate_id, arr);
      }
      const allProjIds = [...projsByCand.values()].flat().map((p) => p.id);
      const depthByProj = new Map<string, { complexity: number; evidence: string }>();
      if (allProjIds.length) {
        const { data: depthRows } = await db
          .from("project_depth_analysis")
          .select("project_id, complexity_score, evidence_quality")
          .in("project_id", allProjIds);
        for (const d of ((depthRows ?? []) as { project_id: string; complexity_score: number | null; evidence_quality: string | null }[])) {
          depthByProj.set(d.project_id, { complexity: d.complexity_score ?? 5, evidence: d.evidence_quality ?? "moderate" });
        }
      }
      rows = rows
        .map((r) => {
          const cid = String(r.id);
          const projs = projsByCand.get(cid) ?? [];
          const skillProjects = new Map<string, number>();
          for (const p of projs) {
            for (const t of p.tech) skillProjects.set(t.trim().toLowerCase(), (skillProjects.get(t.trim().toLowerCase()) ?? 0) + 1);
          }
          const ctx: ScoreContext = {
            skills: skillsByCand.get(cid) ?? [],
            skillProjects,
            depths: projs.map((p) => depthByProj.get(p.id) ?? { complexity: 5, evidence: "moderate" as const }),
            minSalary: typeof r.min_salary === "number" ? r.min_salary : null,
            totalExp: typeof r.total_experience_years === "number" ? r.total_experience_years : null,
            remotePref: typeof r.remote_preference === "string" ? r.remote_preference : null,
            locationCity: typeof r.location_city === "string" ? r.location_city : null,
            availability: typeof r.availability_status === "string" ? r.availability_status : null,
            profileStrength: typeof r.profile_strength === "number" ? r.profile_strength : null,
          };
          const dist = typeof r.best_distance === "number" ? r.best_distance : null;
          const { sub, total, level } = scoreCandidate(jobReq, dist, ctx);
          return { ...r, overall_score: total, match_level: level, sub_scores: sub };
        })
        .sort((a, b) => (Number(b.overall_score) || 0) - (Number(a.overall_score) || 0));
    } catch { /* scoring never blocks results */ }
  }
  if (!rows.length) {
    const { data } = await db
      .from("candidates")
      .select(CAND_COLS)
      .eq("visibility_status", "visible")
      .order("created_at", { ascending: false })
      .limit(limit);
    rows = (data ?? []) as Record<string, unknown>[];
  }
  // HR sees only channels the candidate checked.
  rows = rows.map((r) => applyContactPrefs(r as Parameters<typeof applyContactPrefs>[0]) as unknown as Record<string, unknown>);
  wev.add({ result_count: rows.length, chunk_hits: chunks.length });

  // Persist search + per-candidate matches (best-effort).
  let searchId: string | null = null;
  try {
    const { data: s } = await db.from("searches").insert({
      query_text: queryText,
      filters_json: jobReq,
      result_count: rows.length,
    }).select("id").single();
    searchId = (s as { id: string } | null)?.id ?? null;
  } catch { /* ignore */ }
  if (searchId && !deep) {
    try {
      await db.from("candidate_matches").insert(
        rows.map((r) => ({
          search_id: searchId,
          candidate_id: String(r.id ?? ""),
          score: typeof r.overall_score === "number" ? r.overall_score : null,
          match_reasons_json: (r.sub_scores ?? {}) as Record<string, unknown>,
          status: "shown",
        })),
      );
    } catch { /* cache seed optional */ }
  }
  if (!deep) return Response.json({ results: rows, queryText, searchId });

  // Deep: judge top-10 candidates (one card per candidate, never per chunk).
  try {
    const top = rows.slice(0, 10);
    const inputs: JudgeInput[] = await Promise.all(top.map(async (r) => {
      const cid = String(r.id ?? "");
      const [{ data: cand }, { data: projs }] = await Promise.all([
        db.from("candidates").select("*").eq("id", cid).single(),
        db.from("projects").select("title, description, tech_stack, impact_summary").eq("candidate_id", cid),
      ]);
      return { candidate_id: cid, job: jobReq, candidateJson: { candidate: cand, projects: projs } };
    }));
    const judged = await judgeTop(inputs, defaultOpenAIProvider(), 5);
    const merged = top.map((r, i) => {
      const j = judged[i];
      const rules = typeof r.overall_score === "number" ? (r.overall_score as number) : null;
      const jscore = j && typeof j.overall_score === "number" ? j.overall_score : null;
      return { ...r, judge: j, overall_score: rules != null ? blendWithJudge(rules, jscore) : jscore };
    });
    if (searchId) {
      try {
        await db.from("candidate_matches").insert(
          merged.map((m) => {
            const mm = m as Record<string, unknown>;
            return {
              search_id: searchId,
              candidate_id: String(mm.id ?? ""),
              score: (mm.judge as { overall_score?: number } | null)?.overall_score ?? null,
              match_reasons_json: (mm.judge ?? {}) as Record<string, unknown>,
              status: "shown",
            };
          }),
        );
      } catch { /* ignore */ }
    }
    wev.add({ judged: merged.length, deep: true });
    return Response.json({ results: merged, queryText, searchId, deep: true });
  } catch (e) {
    return Response.json({ results: rows, queryText, searchId, deepError: (e as Error).message });
  }
});
