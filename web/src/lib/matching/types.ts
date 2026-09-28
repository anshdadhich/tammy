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
  role_title?: string;
  seniority_signal?: Seniority | string;
  updated_at?: string;
}

export interface CandidateChunk {
  id: string;
  candidate_id: string;
  chunk_type: ChunkType;
  text: string;
  metadata: ChunkMetadata;
  embedding?: number[];
  distance?: number;
  rank?: number;
}

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
  raw_description: string;
}

export type MatchLevel = "strong" | "partial" | "weak";

export interface SubScores {
  semantic: number;
  skill: number;
  depth: number;
  constraints: number;
  seniority: number;
}

export interface HybridHit {
  candidate_id: string;
  rrf_score: number;
  vector_rank: number | null;
  keyword_rank: number | null;
  vector_distance: number | null;
  keyword_score: number | null;
  chunk_ids: string[];
}

export interface MatchScore extends SubScores {
  candidate_id: string;
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
  debug?: {
    hybrid_rrf?: number;
    judge_score?: number | null;
  };
}

export interface CandidateRow {
  id: string;
  total_experience_years: number | null;
  location_city: string | null;
  remote_preference: string | null;
  min_salary: number | null;
  salary_currency: string | null;
  visibility_status: string;
  consent_status: string | null;
  availability_status: string | null;
  updated_at: string;
}
