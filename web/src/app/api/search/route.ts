import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireHrDb, getSessionUser } from "@/lib/supabase-user";
import { jobSchema } from "@/lib/validators";
import type { JobReq } from "@/lib/matching/types";
import { buildJobQueryText, embedQuery, assertEmbeddingDim, toVectorLiteral, EMBEDDING_DIM } from "@/lib/matching/voyage";
import { buildFtsQueryText } from "@/lib/matching/hybrid";
import { applyContactPrefs } from "@/lib/contact-prefs";
import { defaultOpenAIProvider, judgeTop, type JudgeInput, type JudgeResult } from "@/lib/matching/judge";
import { blendWithJudge, scoreCandidate, metadataTechnologies, type ScoreContext } from "@/lib/scoring-live";
import { withWideEvent } from "@/lib/observe";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { redactPii } from "@/lib/redact";

const MATCH_COUNT = 200;
const PER_CANDIDATE_CHUNKS = 3;
const CACHE_WINDOW_MS = 60 * 60 * 1000;
const JUDGE_TIMEOUT_MS = 25000;
const JUDGE_CONCURRENCY = 5;
const MAX_PROJECTS_DEEP = 6;
const MAX_EXP_ATTACH = 5;
const MAX_PROJECTS_ATTACH = 6;
const MAX_OSSTP_ATTACH = 6;

const CAND_COLS_BASE = "id, full_name, headline, domain, total_experience_years, min_salary, salary_frequency, linkedin_url, github_url, portfolio_url, resume_url, photo_url, profile_strength, remote_preference, location_city, availability_status, show_email, show_phone, show_linkedin, show_github, show_portfolio, show_resume, show_photo";
const CONTACT_COLS = "id, contact_email, contact_phone";
const JUDGE_CAND_COLS = "id, full_name, headline, domain, total_experience_years, min_salary, location_city, remote_preference, availability_status";

function normalizeQueryText(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function canonicalFilters(job: JobReq): string {
  const sorted = (arr: string[]): string[] => [...arr].map((s) => s.trim().toLowerCase()).sort();
  return JSON.stringify({
    d: (job.domain ?? "").trim().toLowerCase(),
    s: (job.seniority ?? "").trim().toLowerCase(),
    m: sorted(job.must_have_skills ?? []),
    n: sorted(job.nice_to_have_skills ?? []),
    emin: job.experience_min ?? null,
    emax: job.experience_max ?? null,
    smin: job.salary_min ?? null,
    smax: job.salary_max ?? null,
    loc: (job.location ?? "").trim().toLowerCase(),
    rem: job.remote_allowed === true,
  });
}

function searchHash(queryText: string, job: JobReq): string {
  return createHash("sha256").update(`${normalizeQueryText(queryText)}\n${canonicalFilters(job)}`).digest("hex");
}

function parseStoredEmbedding(v: unknown): number[] | null {
  try {
    let arr: unknown = v;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t.startsWith("[") || !t.endsWith("]")) return null;
      arr = t.slice(1, -1).split(",").map(Number);
    }
    if (!Array.isArray(arr)) return null;
    const nums = (arr as unknown[]).map(Number);
    assertEmbeddingDim(nums);
    return nums;
  } catch {
    return null;
  }
}

function isJudgePayload(v: unknown): v is JudgeResult {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r.interview_questions) && typeof r.overall_score === "number";
}

export const POST = withWideEvent("/api/search", async (request, wev) => {
  const session = await getSessionUser();
  const hr = await requireHrDb(session);
  if (hr instanceof Response) return hr;
  if (hr.user.viewer.kind !== "hr") {
    return Response.json({ error: "Employer session required." }, { status: 401 });
  }
  const reader = hr.client;
  const body = await request.json().catch(() => null);
  const deep = body?.deep === true;
  const rl = rateLimit(request, {
    key: deep ? "search-deep" : "search",
    limit: deep ? 10 : 60,
    windowMs: deep ? 10 * 60_000 : 60_000,
  });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const rawLimit = typeof body?.limit === "number" && Number.isFinite(body.limit) ? body.limit : 30;
  const limitInput = Number(rawLimit);
  const limit = Math.min(Math.max(Number.isFinite(limitInput) ? Math.floor(limitInput) : 30, 1), deep ? 10 : 30);
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
  const qhash = searchHash(queryText, jobReq);
  const db = supabaseAdmin();
  wev.add({
    job_title: jobReq.job_title,
    domain: jobReq.domain ?? null,
    seniority: jobReq.seniority ?? null,
    must_have: jobReq.must_have_skills.length,
    limit,
    deep,
  });

  const since = new Date(Date.now() - CACHE_WINDOW_MS).toISOString();

  const attachProfileRows = async (target: Record<string, unknown>[]): Promise<void> => {
    for (const r of target) {
      r.work_experiences = [];
      r.projects = [];
      r.education = [];
      r.open_source_contributions = [];
    }
    const ids = [...new Set(target.map((r) => String(r.id ?? "")).filter(Boolean))];
    if (!ids.length) return;
    try {
      const [{ data: expRows }, { data: projRows }, { data: eduRows }, { data: ossRows }] = await Promise.all([
        reader.from("work_experiences")
          .select("candidate_id, company_name, job_title, start_date, end_date, is_current, description, achievements, tech_stack")
          .in("candidate_id", ids)
          .order("start_date", { ascending: false }),
        reader.from("projects")
          .select("candidate_id, id, title, description, problem_statement, tech_stack, role_in_project, project_link, repo_link, deployment_link, impact_summary, project_type")
          .in("candidate_id", ids),
        reader.from("education")
          .select("candidate_id, institution, degree, field_of_study, start_year, end_year, achievements")
          .in("candidate_id", ids)
          .order("start_year", { ascending: false }),
        reader.from("open_source_contributions")
          .select("candidate_id, repo_name, repo_url, description, pr_links, tech_stack, role")
          .in("candidate_id", ids),
      ]);
      const assign = (key: string, data: unknown, cap: number): void => {
        const buckets = new Map<string, Record<string, unknown>[]>();
        for (const raw of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
          const cid = String(raw.candidate_id ?? "");
          if (!cid) continue;
          const entry = { ...raw };
          delete entry.candidate_id;
          const bucket = buckets.get(cid) ?? [];
          if (bucket.length < cap) bucket.push(entry);
          buckets.set(cid, bucket);
        }
        for (const r of target) {
          const bucket = buckets.get(String(r.id ?? ""));
          if (bucket?.length) r[key] = bucket;
        }
      };
      assign("work_experiences", expRows, MAX_EXP_ATTACH);
      assign("projects", projRows, MAX_PROJECTS_ATTACH);
      assign("education", eduRows, MAX_EXP_ATTACH);
      assign("open_source_contributions", ossRows, MAX_OSSTP_ATTACH);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] attach profiles failed detail=${redactPii(msg.slice(0, 200))}`);
    }
  };

  const attachContacts = async (target: Record<string, unknown>[]): Promise<void> => {
    const ids = [...new Set(target.map((r) => String(r.id ?? "")).filter(Boolean))];
    if (!ids.length) return;
    try {
      const { data, error } = await reader.from("candidates").select(CONTACT_COLS).in("id", ids);
      if (error) {
        console.error(`[search] contacts fetch failed detail=${redactPii(error.message.slice(0, 200))}`);
        return;
      }
      const byId = new Map(((data ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]));
      for (const r of target) {
        const c = byId.get(String(r.id ?? ""));
        if (!c) continue;
        if (c.contact_email !== undefined) r.contact_email = c.contact_email;
        if (c.contact_phone !== undefined) r.contact_phone = c.contact_phone;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] contacts fetch failed detail=${redactPii(msg.slice(0, 200))}`);
    }
  };

  const finalize = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
    rows.map((r) => applyContactPrefs(r as Parameters<typeof applyContactPrefs>[0]) as unknown as Record<string, unknown>);

  const findRecentSearch = async (): Promise<{ id: string; created_at: string; query_embedding: unknown } | null> => {
    try {
      const { data, error } = await db
        .from("searches")
        .select("id, created_at, query_embedding")
        .eq("query_hash", qhash)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { id: string; created_at: string; query_embedding: unknown } | null) ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] hash lookup failed, legacy fallback detail=${redactPii(msg.slice(0, 200))}`);
      try {
        const { data } = await db
          .from("searches")
          .select("id, created_at")
          .eq("query_text", queryText)
          .gt("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const rs = data as { id: string; created_at: string } | null;
        return rs ? { ...rs, query_embedding: null } : null;
      } catch {
        return null;
      }
    }
  };

  const corpusUnchanged = async (createdAt: string): Promise<boolean> => {
    try {
      const { data } = await reader
        .from("candidates")
        .select("id")
        .eq("visibility_status", "visible")
        .gt("updated_at", createdAt)
        .limit(1);
      return !data?.length;
    } catch {
      return false;
    }
  };

  const loadCachedMatches = async (searchId: string): Promise<Record<string, unknown>[] | null> => {
    try {
      const { data, error } = await db
        .from("candidate_matches")
        .select(`candidate_id, score, match_reasons_json, candidates(${CAND_COLS_BASE})`)
        .eq("search_id", searchId)
        .order("score", { ascending: false })
        .limit(limit);
      if (error) throw error;
      if (!data?.length) return null;
      return data as unknown as Record<string, unknown>[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] cached matches load failed detail=${redactPii(msg.slice(0, 200))}`);
      return null;
    }
  };

  const recent = await findRecentSearch();
  let reusedEmbedding: number[] | null = null;
  if (recent?.query_embedding) reusedEmbedding = parseStoredEmbedding(recent.query_embedding);

  if (recent?.id && (await corpusUnchanged(recent.created_at))) {
    const cached = await loadCachedMatches(recent.id);
    if (cached?.length) {
      if (deep) {
        const judged = cached.filter((m) => isJudgePayload((m as { match_reasons_json?: unknown }).match_reasons_json));
        if (judged.length) {
          const flattened: Record<string, unknown>[] = [];
          for (const m of judged) {
            const mm = m as { candidates?: Record<string, unknown> | null; candidate_id?: unknown; score?: unknown; match_reasons_json?: unknown };
            const c = mm.candidates;
            if (!c || typeof c !== "object") continue;
            flattened.push({ ...c, id: c.id ?? mm.candidate_id, judge: mm.match_reasons_json, overall_score: typeof mm.score === "number" ? mm.score : null });
          }
          if (flattened.length) {
            await attachProfileRows(flattened);
            await attachContacts(flattened);
            const results = finalize(flattened);
            wev.add({ cached: true, deep_cached: true, result_count: results.length, search_id: recent.id });
            return Response.json({ results, queryText, searchId: recent.id, cached: true, deep: true });
          }
        }
      } else {
        const flattened: Record<string, unknown>[] = [];
        for (const m of cached) {
          const mm = m as { candidates?: Record<string, unknown> | null; candidate_id?: unknown; score?: unknown; match_reasons_json?: unknown };
          const c = mm.candidates;
          if (!c || typeof c !== "object") continue;
          flattened.push({
            ...c,
            id: c.id ?? mm.candidate_id,
            overall_score: typeof mm.score === "number" ? mm.score : null,
            sub_scores: (mm.match_reasons_json as Record<string, unknown> | null) ?? {},
          });
        }
        if (flattened.length) {
          await attachProfileRows(flattened);
          await attachContacts(flattened);
          const results = finalize(flattened);
          wev.add({ cached: true, result_count: results.length, search_id: recent.id });
          return Response.json({ results, queryText, searchId: recent.id, cached: true });
        }
      }
    }
  }

  type Chunk = { candidate_id: string; distance?: number; content_text?: string; chunk_type?: string; metadata_json?: unknown };
  let chunks: Chunk[] = [];
  let embedFailed = false;
  let qvec: number[] | null = reusedEmbedding;
  if (!qvec) {
    try {
      qvec = await embedQuery(queryText);
      assertEmbeddingDim(qvec, EMBEDDING_DIM);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] embed failed detail=${redactPii(msg.slice(0, 200))}`);
      embedFailed = true;
      qvec = null;
    }
  }
  wev.add({ embed_failed: embedFailed, embed_reused: reusedEmbedding != null });

  if (qvec) {
    const fts = buildFtsQueryText(jobReq, 200);
    const baseParams = {
      query_embedding: toVectorLiteral(qvec, EMBEDDING_DIM),
      match_count: MATCH_COUNT,
      p_domain: jobReq.domain?.trim() ? jobReq.domain.trim() : null,
      p_min_exp: jobReq.experience_min ?? null,
      p_salary_max: jobReq.salary_max ?? null,
      p_location: jobReq.location?.trim() ? jobReq.location.trim() : null,
      p_candidate_ids: null,
      p_availability: null,
      p_chunk_types: null,
      p_fts_query: fts.trim() ? fts : null,
      p_per_candidate: PER_CANDIDATE_CHUNKS,
    };
    try {
      const { data, error } = await reader.rpc("match_chunks", baseParams);
      if (error) throw error;
      if (data) chunks = data as Chunk[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] filtered rpc failed, fallback detail=${redactPii(msg.slice(0, 200))}`);
      try {
        const { data, error } = await reader.rpc("match_chunks", {
          query_embedding: toVectorLiteral(qvec, EMBEDDING_DIM),
          match_count: MATCH_COUNT,
        });
        if (error) throw error;
        if (data) chunks = data as Chunk[];
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        console.error(`[search] rpc fallback failed detail=${redactPii(msg2.slice(0, 200))}`);
      }
    }
  }

  let rows: Record<string, unknown>[] = [];
  if (chunks.length) {
    const byCand = new Map<string, { best: number; hits: Chunk[] }>();
    for (const c of chunks) {
      if (!c.candidate_id) continue;
      let g = byCand.get(c.candidate_id);
      if (!g) {
        g = { best: Infinity, hits: [] };
        byCand.set(c.candidate_id, g);
      }
      const d = typeof c.distance === "number" ? c.distance : Infinity;
      if (d < g.best) g.best = d;
      if (g.hits.length < PER_CANDIDATE_CHUNKS) g.hits.push(c);
    }
    for (const g of byCand.values()) {
      g.hits.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    const ranked = [...byCand.entries()].sort((a, b) => a[1].best - b[1].best).slice(0, limit);
    const ids = ranked.map(([id]) => id);
    if (ids.length) {
      const { data: cands } = await reader
        .from("candidates")
        .select(CAND_COLS_BASE)
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
    try {
      const scoreIds = rows.map((r) => String(r.id));
      const chunkTechByCand = new Map<string, string[]>();
      for (const c of chunks) {
        if (!c.candidate_id || !scoreIds.includes(c.candidate_id)) continue;
        const techs = metadataTechnologies(c.metadata_json);
        if (!techs.length) continue;
        const arr = chunkTechByCand.get(c.candidate_id) ?? [];
        for (const t of techs) {
          if (!arr.some((x) => x.toLowerCase() === t.toLowerCase())) arr.push(t);
        }
        chunkTechByCand.set(c.candidate_id, arr);
      }
      const [{ data: skillRows }, { data: projRows }] = await Promise.all([
        reader.from("candidate_skills").select("candidate_id, skills(name)").in("candidate_id", scoreIds),
        reader.from("projects").select("id, candidate_id, tech_stack").in("candidate_id", scoreIds),
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
        const { data: depthRows } = await reader
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
          const listed = skillsByCand.get(cid) ?? [];
          const chunkTechs = chunkTechByCand.get(cid) ?? [];
          const mergedSkills = [...listed, ...chunkTechs.filter((t) => !listed.some((x) => x.toLowerCase() === t.toLowerCase()))];
          const ctx: ScoreContext = {
            skills: mergedSkills,
            skillProjects,
            depths: projs.map((p) => depthByProj.get(p.id) ?? { complexity: 5, evidence: "moderate" as const }),
            minSalary: typeof r.min_salary === "number" ? r.min_salary : null,
            salaryFreq: typeof r.salary_frequency === "string" ? r.salary_frequency : null,
            totalExp: typeof r.total_experience_years === "number" ? r.total_experience_years : null,
            remotePref: typeof r.remote_preference === "string" ? r.remote_preference : null,
            locationCity: typeof r.location_city === "string" ? r.location_city : null,
            availability: typeof r.availability_status === "string" ? r.availability_status : null,
            profileStrength: typeof r.profile_strength === "number" ? r.profile_strength : null,
          };
          const dist = typeof r.best_distance === "number" ? r.best_distance : null;
          const { sub, total, level } = scoreCandidate(jobReq, dist, ctx);
          return {
            ...r,
            overall_score: total,
            match_level: level,
            sub_scores: sub,
            top_skills: mergedSkills.slice(0, 4),
          };
        })
        .sort((a, b) => (Number(b.overall_score) || 0) - (Number(a.overall_score) || 0));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] scoring failed detail=${redactPii(msg.slice(0, 200))}`);
    }
  }
  if (!rows.length) {
    const { data } = await reader
      .from("candidates")
      .select(CAND_COLS_BASE)
      .eq("visibility_status", "visible")
      .order("created_at", { ascending: false })
      .limit(limit);
    rows = (data ?? []) as Record<string, unknown>[];
  }
  wev.add({ result_count: rows.length, chunk_hits: chunks.length });

  let searchId: string | null = null;
  const searchPayload: Record<string, unknown> = {
    query_text: queryText,
    filters_json: jobReq,
    result_count: rows.length,
  };
  try {
    const full = { ...searchPayload, query_hash: qhash, query_embedding: qvec ? toVectorLiteral(qvec, EMBEDDING_DIM) : null };
    const { data: s, error } = await db.from("searches").insert(full).select("id").single();
    if (error) throw error;
    searchId = (s as { id: string } | null)?.id ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[search] search insert with hash failed, legacy fallback detail=${redactPii(msg.slice(0, 200))}`);
    try {
      const { data: s } = await db.from("searches").insert(searchPayload).select("id").single();
      searchId = (s as { id: string } | null)?.id ?? null;
    } catch {
      searchId = null;
    }
  }

  const saveMatches = async (entries: { candidate_id: string; score: number | null; reasons: Record<string, unknown> }[]): Promise<void> => {
    if (!searchId || !entries.length) return;
    const payload = entries
      .filter((m) => m.candidate_id)
      .map((m) => ({
        search_id: searchId as string,
        candidate_id: m.candidate_id,
        score: m.score,
        match_reasons_json: m.reasons,
        status: "shown",
      }));
    if (!payload.length) return;
    try {
      const { error } = await db.from("candidate_matches").upsert(payload, { onConflict: "search_id,candidate_id", ignoreDuplicates: true });
      if (error) throw error;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[search] matches upsert failed, insert fallback detail=${redactPii(msg.slice(0, 200))}`);
      try {
        await db.from("candidate_matches").insert(payload);
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        console.error(`[search] matches insert failed detail=${redactPii(msg2.slice(0, 200))}`);
      }
    }
  };

  if (searchId && !deep) {
    const scored = rows.filter((r) => typeof r.overall_score === "number");
    await saveMatches(
      scored.map((r) => ({
        candidate_id: String(r.id ?? ""),
        score: r.overall_score as number,
        reasons: (r.sub_scores ?? {}) as Record<string, unknown>,
      })),
    );
  }
  if (!deep) {
    await attachProfileRows(rows);
    await attachContacts(rows);
    const results = finalize(rows);
    wev.add({ degraded: embedFailed });
    return Response.json({ results, queryText, searchId, degraded: embedFailed || undefined });
  }

  try {
    const top = rows.slice(0, 10);
    const topIds = top.map((r) => String(r.id ?? "")).filter((s): s is string => s.length > 0);
    const [{ data: judgeCands }, { data: judgeProjs }] = await Promise.all([
      topIds.length
        ? reader.from("candidates").select(JUDGE_CAND_COLS).in("id", topIds)
        : Promise.resolve({ data: [] as unknown[] }),
      topIds.length
        ? reader.from("projects").select("candidate_id, title, description, tech_stack, impact_summary").in("candidate_id", topIds)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const candById = new Map(((judgeCands ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]));
    const projsById = new Map<string, Record<string, unknown>[]>();
    for (const p of ((judgeProjs ?? []) as Record<string, unknown>[])) {
      const cid = String(p.candidate_id ?? "");
      if (!cid) continue;
      const bucket = projsById.get(cid) ?? [];
      if (bucket.length < MAX_PROJECTS_DEEP) bucket.push(p);
      projsById.set(cid, bucket);
    }
    const inputs: JudgeInput[] = top.map((r) => {
      const cid = String(r.id ?? "");
      return { candidate_id: cid, job: jobReq, candidateJson: { candidate: candById.get(cid) ?? r, projects: projsById.get(cid) ?? [] } };
    });
    const judged = await judgeTop(inputs, defaultOpenAIProvider(), JUDGE_CONCURRENCY, { timeoutMs: JUDGE_TIMEOUT_MS });
    const judgeNulls = judged.filter((jj) => jj == null).length;
    wev.add({ judge_nulls: judgeNulls, judged: judged.length });
    const merged = top.map((r, i) => {
      const jj = judged[i];
      const rules = typeof r.overall_score === "number" ? (r.overall_score as number) : null;
      const jscore = jj && typeof jj.overall_score === "number" ? jj.overall_score : null;
      return { ...r, judge: jj, overall_score: rules != null ? blendWithJudge(rules, jscore) : jscore };
    });
    if (searchId) {
      await saveMatches(
        merged.map((m, i) => {
          const mm = m as Record<string, unknown>;
          const jj = mm.judge as JudgeResult | null;
          const rulesScore = typeof top[i]?.overall_score === "number" ? (top[i].overall_score as number) : null;
          return {
            candidate_id: String(mm.id ?? ""),
            score: jj?.overall_score ?? rulesScore,
            reasons: ((jj ?? {}) as unknown) as Record<string, unknown>,
          };
        }),
      );
    }
    wev.add({ judged: merged.length, deep: true, degraded: embedFailed || judgeNulls === merged.length });
    await attachProfileRows(merged);
    await attachContacts(merged);
    const results = finalize(merged);
    return Response.json({ results, queryText, searchId, deep: true, degraded: (embedFailed || (merged.length > 0 && judgeNulls === merged.length)) || undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[search] deep judge failed detail=${redactPii(msg.slice(0, 200))}`);
    await attachProfileRows(rows);
    await attachContacts(rows);
    const results = finalize(rows);
    return Response.json({ results, queryText, searchId, deepError: "Deep read unavailable. Showing rule-ranked results.", degraded: true });
  }
});
