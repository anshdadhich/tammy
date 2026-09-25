import type { HybridHit, JobReq } from "./types";

export interface SqlQuery {
  text: string;
  values: unknown[];
}

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

  if (job.salary_max != null) {
    clauses.push(
      `(c.min_salary IS NULL OR c.min_salary <= $${i++})`,
    );
    values.push(job.salary_max);
  }

  if (job.location && !job.remote_allowed) {
    clauses.push(
      `(c.remote_ok = TRUE OR c.location ILIKE $${i++})`,
    );
    values.push(`%${job.location}%`);
  } else if (job.location && job.remote_allowed) {
  }

  return { text: clauses.join("\n  AND "), values };
}

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

export function buildVectorSearchQuery(opts: {
  queryEmbedding: number[];
  job: JobReq;
  candidateIds?: string[];
  limitPerChunk?: number;
}): SqlQuery {
  const { queryEmbedding, job, candidateIds = [], limitPerChunk = 100 } = opts;
  const values: unknown[] = [];
  let i = 1;

  const vecLiteral = `[${queryEmbedding.join(",")}]`;

  const filters: string[] = [];
  if (candidateIds.length > 0) {
    filters.push(`pc.candidate_id = ANY($${i++})`);
    values.push(candidateIds);
  }
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
    values: [...values, `${job.job_title} ${skills.join(" ")}`],
  };
}

export interface RankedChunk {
  id: string;
  candidate_id: string;
  rank: number;
  distance?: number;
  kw_score?: number;
}

const RRF_K = 60;

function rrf(rank: number): number {
  return 1 / (RRF_K + rank);
}

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
