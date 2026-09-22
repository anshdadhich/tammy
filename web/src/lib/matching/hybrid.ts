/**
 * Hybrid retrieval: hard filters -> vector + keyword -> RRF -> top 30.
 *
 * Assumes Postgres + pgvector + pg_trgm with roughly:
 *   candidates(id, total_experience_years, location, remote_ok,
 *              min_salary, salary_currency, is_visible,
 *              consent_to_match, is_active, updated_at, ...)
 *   profile_chunks(id, candidate_id, chunk_type, text, metadata jsonb,
 *                  embedding vector, fts tsvector GENERATED ...)
 *
 * All builders return { text, values } ($1-style params) so any pg client
 * (node-postgres, postgres.js via unsafe-adapter, Drizzle sql, ...) can run them.
 * Pure-TS RRF fuse (combineRanks) is client-agnostic and unit-testable.
 */

import type { HybridHit, JobReq } from "./types";

export interface SqlQuery {
  text: string;
  values: unknown[];
}

// ---------------------------------------------------------------------------
// Step 1 (Bouncer): hard SQL filters — eliminate impossible candidates.
// docs/07: salary fit, location/remote, min exp, visible + consent, active.
// ---------------------------------------------------------------------------

export function buildHardFilterWhere(job: JobReq): SqlQuery {
  const clauses: string[] = [
    `c.is_visible = TRUE`,
    `c.consent_to_match = TRUE`,
    `c.is_active = TRUE`,
  ];
  const values: unknown[] = [];
  let i = 1;

  if (job.experience_min != null) {
    clauses.push(`COALESCE(c.total_experience_years, 0) >= $${i++}`);
    values.push(job.experience_min);
  }

  // Salary fit: candidate min must be <= job max (if both known).
  if (job.salary_max != null) {
    clauses.push(
      `(c.min_salary IS NULL OR c.min_salary <= $${i++})`,
    );
    values.push(job.salary_max);
  }

  // Location/remote: pass if remote ok on either side, else location match.
  if (job.location && !job.remote_allowed) {
    clauses.push(
      `(c.remote_ok = TRUE OR c.location ILIKE $${i++})`,
    );
    values.push(`%${job.location}%`);
  } else if (job.location && job.remote_allowed) {
    // Remote-friendly job: still prefer location but don't exclude.
    // No hard clause — handled as soft signal in scoring.ts constraints.
  }

  return { text: clauses.join("\n  AND "), values };
}

/** Full candidate pre-filter query (Step 1 of funnel). */
export function buildPrefilterQuery(
  job: JobReq,
  limit = 2000,
): SqlQuery {
  const where = buildHardFilterWhere(job);
  return {
    text: `SELECT c.id
FROM candidates c
WHERE ${where.text}
ORDER BY c.updated_at DESC
LIMIT ${Number(limit)}`,
    values: where.values,
  };
}

// ---------------------------------------------------------------------------
// Step 2a (Scout, semantic): filtered vector search over profile_chunks.
// ---------------------------------------------------------------------------

export function buildVectorSearchQuery(opts: {
  queryEmbedding: number[];
  job: JobReq;
  /** Pre-filtered candidate ids from Step 1 (empty = skip id filter). */
  candidateIds?: string[];
  limitPerChunk?: number;
}): SqlQuery {
  const { queryEmbedding, job, candidateIds = [], limitPerChunk = 100 } = opts;
  const values: unknown[] = [];
  let i = 1;

  // pgvector: embedding <=> $1 gives cosine distance (0 = identical).
  const vecLiteral = `[${queryEmbedding.join(",")}]`;

  const filters: string[] = [];
  if (candidateIds.length > 0) {
    filters.push(`pc.candidate_id = ANY($${i++})`);
    values.push(candidateIds);
  }
  // Optional metadata pre-filter: domain tag overlap boosts precision.
  if (job.domain) {
    filters.push(
      `((pc.metadata->>'domain_tags') ILIKE $${i++} OR (pc.metadata->>'domain_tags') IS NULL)`,
    );
    values.push(`%${job.domain}%`);
  }
  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  return {
    text: `SELECT pc.id, pc.candidate_id, pc.chunk_type, pc.text, pc.metadata,
       (pc.embedding <=> $${i}::vector) AS distance
FROM profile_chunks pc
${whereSql}
ORDER BY pc.embedding <=> $${i}::vector
LIMIT ${Number(limitPerChunk)}`,
    values: [...values, vecLiteral],
  };
}

// ---------------------------------------------------------------------------
// Step 2b (Scout, keyword): ILIKE + pg_trgm similarity over chunks.
// Catches exact skills/titles; evidence weighting happens in RRF + depth.
// Requires: CREATE EXTENSION pg_trgm; + GIN index on text.
// ---------------------------------------------------------------------------

export function buildKeywordSearchQuery(opts: {
  job: JobReq;
  candidateIds?: string[];
  limitPerChunk?: number;
}): SqlQuery {
  const { job, candidateIds = [], limitPerChunk = 100 } = opts;
  const skills = [...job.must_have_skills, ...job.nice_to_have_skills];
  const values: unknown[] = [];
  let i = 1;

  const filters: string[] = [];
  if (candidateIds.length > 0) {
    filters.push(`pc.candidate_id = ANY($${i++})`);
    values.push(candidateIds);
  }

  // One ILIKE per skill would explode params; fold into a single OR block
  // over a skill array param instead.
  const skillParam = `$${i++}`;
  values.push(skills);
  filters.push(`EXISTS (
    SELECT 1 FROM unnest(${skillParam}::text[]) s
    WHERE pc.text ILIKE '%' || s || '%'
  )`);

  const whereSql = `WHERE ${filters.join(" AND ")}`;

  return {
    text: `SELECT pc.id, pc.candidate_id, pc.chunk_type, pc.text, pc.metadata,
       GREATEST(
         similarity(pc.text, $${i}),
         similarity(COALESCE(pc.metadata->>'project_title',''), $${i})
       ) AS kw_score
FROM profile_chunks pc
${whereSql}
ORDER BY kw_score DESC
LIMIT ${Number(limitPerChunk)}`,
    // $i = representative query text for trigram similarity ranking
    values: [...values, `${job.job_title} ${skills.join(" ")}`],
  };
}

// ---------------------------------------------------------------------------
// Step 2c: RRF combine (Reciprocal Rank Fusion) + top-30.
// inputs: ranked chunk lists grouped per retrieval arm; output: per-candidate.
// ---------------------------------------------------------------------------

export interface RankedChunk {
  id: string;
  candidate_id: string;
  rank: number; // 1-based within its arm
  distance?: number; // vector arm
  kw_score?: number; // keyword arm
}

const RRF_K = 60;

function rrf(rank: number): number {
  return 1 / (RRF_K + rank);
}

/**
 * Fuse vector + keyword chunk rankings into per-candidate scores.
 * Returns topN candidates sorted desc by rrf_score (default top 30).
 */
export function combineRanks(
  vectorRanks: RankedChunk[],
  keywordRanks: RankedChunk[],
  topN = 30,
): HybridHit[] {
  const byCandidate = new Map<string, HybridHit>();
  const chunkSets = new Map<string, Set<string>>();

  const acc = (
    r: RankedChunk,
    arm: "vector" | "keyword",
  ) => {
    let e = byCandidate.get(r.candidate_id);
    if (!e) {
      e = {
        candidate_id: r.candidate_id,
        rrf_score: 0,
        vector_rank: null,
        keyword_rank: null,
        vector_distance: null,
        keyword_score: null,
        chunk_ids: [],
      };
      byCandidate.set(r.candidate_id, e);
      chunkSets.set(r.candidate_id, new Set<string>());
    }
    e.rrf_score += rrf(r.rank);
    if (arm === "vector") {
      if (e.vector_rank == null || r.rank < e.vector_rank) {
        e.vector_rank = r.rank;
        e.vector_distance = r.distance ?? null;
      }
    } else {
      if (e.keyword_rank == null || r.rank < e.keyword_rank) {
        e.keyword_rank = r.rank;
        e.keyword_score = r.kw_score ?? null;
      }
    }
    const seen = chunkSets.get(r.candidate_id)!;
    if (!seen.has(r.id)) {
      seen.add(r.id);
      e.chunk_ids.push(r.id);
    }
  };

  vectorRanks.forEach((r) => acc(r, "vector"));
  keywordRanks.forEach((r) => acc(r, "keyword"));

  return Array.from(byCandidate.values())
    .sort((a, b) => b.rrf_score - a.rrf_score)
    .slice(0, topN);
}
