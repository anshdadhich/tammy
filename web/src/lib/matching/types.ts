/**
 * Matching pipeline shared types.
 *
 * Mirrors docs/07 (funnel), docs/08 (chunks/metadata), docs/13 (judge + match object).
 */

// ---------------------------------------------------------------------------
// Chunks (docs/08)
// ---------------------------------------------------------------------------

export type ChunkType =
  | "summary"
  | "experience"
  | "project"
  | "education"
  | "skills";

export type Complexity = "low" | "medium" | "high" | "very_high";
export type EvidenceQuality = "weak" | "moderate" | "strong";
export type Seniority = "intern" | "junior" | "mid" | "senior" | "lead" | "unknown";

export interface ChunkMetadata {
  chunk_type: ChunkType;
  project_title?: string;
  technologies?: string[];
  domain_tags?: string[];
  complexity?: Complexity | string;
  evidence_quality?: EvidenceQuality | string;
  candidate_id: string;
  /** Optional: role title, employer, recency hints, seniority signal */
  role_title?: string;
  seniority_signal?: Seniority | string;
  /** Unix ms or ISO string of when the underlying record was updated */
  updated_at?: string;
}

export interface CandidateChunk {
  id: string;
  candidate_id: string;
  chunk_type: ChunkType;
  text: string;
  metadata: ChunkMetadata;
  /** pgvector embedding (voyage-4-lite dims). Absent before embedding step. */
  embedding?: number[];
  /** Cosine distance from query (0 = identical). Populated by vector search. */
  distance?: number;
  /** Rank within its own retrieval list (1-based). Used for RRF. */
  rank?: number;
}

// ---------------------------------------------------------------------------
// Job request (docs/13 prompt #3 output shape)
// ---------------------------------------------------------------------------

export interface JobReq {
  job_title: string;
  domain?: string;
  seniority?: Seniority | string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  experience_min?: number | null;
  experience_max?: number | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_frequency?: string | null;
  location?: string | null;
  remote_allowed?: boolean;
  core_responsibilities?: string[];
  implied_technical_needs?: string[];
  red_flags_or_constraints?: string[];
  /** Raw JD text (kept for embedding + judge prompt). */
  raw_description: string;
}

// ---------------------------------------------------------------------------
// Retrieval / scoring
// ---------------------------------------------------------------------------

export type MatchLevel = "strong" | "partial" | "weak";

/** Sub-scores are all normalized 0..1 before weighting in scoring.ts */
export interface SubScores {
  /** Cosine-derived semantic similarity (vector search). */
  semantic: number;
  /** Normalized skill overlap w/ evidence weighting (keyword side). */
  skill: number;
  /** Project/experience depth signal (complexity, evidence_quality). */
  depth: number;
  /** Salary + location/remote + availability fit. */
  constraints: number;
  /** Seniority / experience-range fit. */
  seniority: number;
}

export interface HybridHit {
  candidate_id: string;
  /** RRF fused score (higher = better). */
  rrf_score: number;
  vector_rank: number | null;
  keyword_rank: number | null;
  vector_distance: number | null;
  keyword_score: number | null;
  chunk_ids: string[];
}

export interface MatchScore extends SubScores {
  candidate_id: string;
  /** Weighted final 0..100 (see scoring.ts). */
  overall_score: number;
  match_level: MatchLevel;
  matched_requirements: string[];
  missing_requirements: string[];
  project_evidence: string[];
  strengths: string[];
  gaps: string[];
  risk_factors: string[];
  salary_fit: "good" | "partial" | "poor" | "unknown";
  location_fit: "good" | "partial" | "poor" | "unknown";
  seniority_fit: "good" | "partial" | "poor" | "unknown";
  recommendation: string;
  interview_questions: string[];
  /** Debug: rule/rerank + LLM judge contributions. */
  debug?: {
    hybrid_rrf?: number;
    judge_score?: number | null;
  };
}

/** Minimal candidate row shape the SQL builders assume. */
export interface CandidateRow {
  id: string;
  total_experience_years: number | null;
  location: string | null;
  remote_ok: boolean | null;
  min_salary: number | null;
  salary_currency: string | null;
  is_visible: boolean;
  consent_to_match: boolean;
  is_active: boolean;
  updated_at: string;
}
