import type { HybridHit, JobReq } from "./types";
import { toVectorLiteral } from "./voyage";

export interface SqlQuery {
  text: string;
  values: unknown[];
}

export const PREFILTER_MAX = 5000;
export const VECTOR_LIMIT_MAX = 200;

export function clampLimit(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function buildHardFilterWhere(job: JobReq, alias = "c"): SqlQuery {
  const clauses: string[] = [
    `${alias}.visibility_status = 'visible'`,
    `(${alias}.consent_status IS NULL OR ${alias}.consent_status <> 'withdrawn')`,
  ];
  const values: unknown[] = [];
  let i = 1;

  if (job.experience_min != null) {
    clauses.push(`COALESCE(${alias}.total_experience_years, 0) >= $${i++}`);
    values.push(job.experience_min);
  }

  if (job.salary_max != null) {
    clauses.push(
      `(${alias}.min_salary IS NULL OR ${alias}.min_salary <= $${i++})`,
    );
    values.push(job.salary_max);
  }

  if (job.location && !job.remote_allowed) {
    clauses.push(
      `(${alias}.remote_preference IN ('remote_only','flexible') OR ${alias}.location_city ILIKE $${i++} ESCAPE '\\')`,
    );
    values.push(`%${escapeLike(job.location)}%`);
  }

  return { text: clauses.join("\n  AND "), values };
}

export function buildPrefilterQuery(
  job: JobReq,
  limit = 2000,
): SqlQuery {
  const where = buildHardFilterWhere(job);
  const safeLimit = clampLimit(limit, 1, PREFILTER_MAX, 2000);
  return {
    text: `SELECT c.id
FROM candidates c
WHERE ${where.text}
ORDER BY c.updated_at DESC
LIMIT ${safeLimit}`,
    values: where.values,
  };
}

export function buildVectorSearchQuery(opts: {
  queryEmbedding: number[];
  job: JobReq;
  candidateIds?: string[];
  chunkTypes?: string[];
  limitPerChunk?: number;
}): SqlQuery {
  const { queryEmbedding, job, candidateIds = [], chunkTypes = [], limitPerChunk = 100 } = opts;
  const values: unknown[] = [];
  let i = 1;

  const vecLiteral = toVectorLiteral(queryEmbedding);

  const filters: string[] = [];
  if (candidateIds.length > 0) {
    filters.push(`pc.candidate_id = ANY($${i++})`);
    values.push(candidateIds);
  }
  if (chunkTypes.length > 0) {
    filters.push(`pc.chunk_type = ANY($${i++})`);
    values.push(chunkTypes);
  }
  if (job.domain) {
    filters.push(
      `(pc.metadata_json->'domain_tags' ? $${i} OR pc.metadata_json->'technologies' ? $${i} OR pc.metadata_json IS NULL OR pc.metadata_json = '{}'::jsonb)`,
    );
    values.push(job.domain);
    i += 1;
  }
  const hard = buildHardFilterWhere(job);
  for (const v of hard.values) {
    values.push(v);
  }
  const hardSql = hard.text.replace(/\$\d+/g, () => `$${i++}`);
  filters.push(hardSql);
  filters.push(`pc.embedding IS NOT NULL`);

  const vecParam = `$${i}`;
  values.push(vecLiteral);
  const whereSql = `WHERE ${filters.join(" AND ")}`;
  const safeLimit = clampLimit(limitPerChunk, 1, VECTOR_LIMIT_MAX, 100);

  return {
    text: `SELECT pc.id, pc.candidate_id, pc.chunk_type, pc.content_text, pc.metadata_json,
       (pc.embedding <=> ${vecParam}::vector) AS distance
FROM profile_chunks pc
JOIN candidates c ON c.id = pc.candidate_id
${whereSql}
ORDER BY pc.embedding <=> ${vecParam}::vector
LIMIT ${safeLimit}`,
    values,
  };
}

export function buildFtsQueryText(job: JobReq, maxLen = 500): string {
  const skills = [...job.must_have_skills, ...job.nice_to_have_skills];
  return `${job.job_title} ${skills.join(" ")}`.slice(0, maxLen);
}

export function buildKeywordSearchQuery(opts: {
  job: JobReq;
  candidateIds?: string[];
  chunkTypes?: string[];
  limitPerChunk?: number;
}): SqlQuery {
  const { job, candidateIds = [], chunkTypes = [], limitPerChunk = 100 } = opts;
  const values: unknown[] = [];
  let i = 1;

  const filters: string[] = [];
  if (candidateIds.length > 0) {
    filters.push(`pc.candidate_id = ANY($${i++})`);
    values.push(candidateIds);
  }
  if (chunkTypes.length > 0) {
    filters.push(`pc.chunk_type = ANY($${i++})`);
    values.push(chunkTypes);
  }

  const ftsParam = `$${i++}`;
  values.push(buildFtsQueryText(job));
  filters.push(`to_tsvector('english', pc.content_text) @@ plainto_tsquery('english', ${ftsParam})`);

  const hard = buildHardFilterWhere(job);
  for (const v of hard.values) {
    values.push(v);
  }
  const hardSql = hard.text.replace(/\$\d+/g, () => `$${i++}`);
  filters.push(hardSql);

  const rankParam = `$${i++}`;
  values.push(buildFtsQueryText(job));
  const safeLimit = clampLimit(limitPerChunk, 1, VECTOR_LIMIT_MAX, 100);

  return {
    text: `SELECT pc.id, pc.candidate_id, pc.chunk_type, pc.content_text, pc.metadata_json,
       ts_rank(to_tsvector('english', pc.content_text), plainto_tsquery('english', ${rankParam})) AS kw_score
FROM profile_chunks pc
JOIN candidates c ON c.id = pc.candidate_id
WHERE ${filters.join(" AND ")}
ORDER BY kw_score DESC
LIMIT ${safeLimit}`,
    values,
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
  const safeTopN = clampLimit(topN, 1, 200, 30);
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
    const seen = chunkSets.get(r.candidate_id);
    if (seen && !seen.has(r.id)) {
      seen.add(r.id);
      e.chunk_ids.push(r.id);
    }
  };

  vectorRanks.forEach((r) => acc(r, "vector"));
  keywordRanks.forEach((r) => acc(r, "keyword"));

  return Array.from(byCandidate.values())
    .sort((a, b) => b.rrf_score - a.rrf_score)
    .slice(0, safeTopN);
}
