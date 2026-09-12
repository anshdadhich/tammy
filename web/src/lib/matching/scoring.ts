/**
 * Step 5 (Reporter): deterministic final blend.
 *
 * final(0..1) = 0.25*semantic + 0.25*skill + 0.20*depth
 *             + 0.15*constraints + 0.10*seniority
 * overall_score = round(final * 100)
 *
 * Inputs are pre-normalized 0..1 sub-scores; helpers below compute the
 * rule-based ones (skill/depth/constraints/seniority) from retrieval +
 * candidate/job fields. The LLM judge score is blended separately by the
 * caller (suggested: 0.7*rules + 0.3*judge/100 in deep mode).
 */

import type { JobReq, MatchLevel, SubScores } from "./types";

export const WEIGHTS = {
  semantic: 0.25,
  skill: 0.25,
  depth: 0.2,
  constraints: 0.15,
  seniority: 0.1,
} as const;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Weighted blend -> 0..100 int. */
export function finalScore(sub: SubScores): number {
  const f =
    WEIGHTS.semantic * clamp01(sub.semantic) +
    WEIGHTS.skill * clamp01(sub.skill) +
    WEIGHTS.depth * clamp01(sub.depth) +
    WEIGHTS.constraints * clamp01(sub.constraints) +
    WEIGHTS.seniority * clamp01(sub.seniority);
  return Math.round(f * 100);
}

export function matchLevel(total0to100: number): MatchLevel {
  if (total0to100 >= 75) return "strong";
  if (total0to100 >= 50) return "partial";
  return "weak";
}

/** Cosine distance (pgvector <=>) -> similarity 0..1. */
export function semanticFromDistance(distance: number | null): number {
  if (distance == null) return 0;
  return clamp01((2 - distance) / 2); // cosine distance lives in [0,2]
}

// ---------------------------------------------------------------------------
// Skill overlap with evidence weighting (docs/07: React in 3 projects >
// listed once). chunkHits = per-skill evidence counts.
// ---------------------------------------------------------------------------

export function skillScore(
  must: string[],
  nice: string[],
  /** skill (lowercased) -> number of chunks evidencing it */
  evidenceCounts: Map<string, number> | Record<string, number>,
): number {
  const get = (s: string): number => {
    const k = s.toLowerCase();
    const v =
      evidenceCounts instanceof Map
        ? (evidenceCounts.get(k) ?? evidenceCounts.get(s) ?? 0)
        : ((evidenceCounts as Record<string, number>)[k] ?? 0);
    return v;
  };
  const credit = (count: number) => (count <= 0 ? 0 : count === 1 ? 0.6 : 1);

  const mustW = 0.75;
  const niceW = 0.25;
  const mustAvg =
    must.length === 0
      ? 1
      : must.reduce((a, s) => a + credit(get(s)), 0) / must.length;
  const niceAvg =
    nice.length === 0
      ? 0
      : nice.reduce((a, s) => a + credit(get(s)), 0) / nice.length;
  return clamp01(mustW * mustAvg + niceW * niceAvg);
}

// ---------------------------------------------------------------------------
// Depth: complexity + evidence_quality averaged over top chunks (0..1).
// ---------------------------------------------------------------------------

const COMPLEXITY_W: Record<string, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  very_high: 1,
};
const EVIDENCE_W: Record<string, number> = {
  weak: 0.25,
  moderate: 0.6,
  strong: 1,
};

export function depthScore(
  chunks: Array<{ complexity?: string; evidence_quality?: string }>,
): number {
  if (chunks.length === 0) return 0;
  const vals = chunks.map((c) => {
    const cx = COMPLEXITY_W[String(c.complexity ?? "").toLowerCase()] ?? 0.4;
    const ev = EVIDENCE_W[String(c.evidence_quality ?? "").toLowerCase()] ?? 0.4;
    return (cx + ev) / 2;
  });
  // Best-chunk matters most: max blended with mean.
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return clamp01(0.6 * max + 0.4 * mean);
}

// ---------------------------------------------------------------------------
// Constraints: salary + location/remote fit (0..1).
// ---------------------------------------------------------------------------

export function constraintsScore(
  job: Pick<JobReq, "salary_max" | "location" | "remote_allowed">,
  candidate: {
    min_salary?: number | null;
    location?: string | null;
    remote_ok?: boolean | null;
  },
): number {
  let salary = 1; // unknown = neutral-good (don't punish missing data)
  if (job.salary_max != null && candidate.min_salary != null) {
    salary = candidate.min_salary <= job.salary_max ? 1 : 0;
  }

  let location = 1;
  if (job.location) {
    const same =
      candidate.location?.toLowerCase().includes(job.location.toLowerCase()) ??
      false;
    if (same) location = 1;
    else if (job.remote_allowed || candidate.remote_ok) location = 0.7;
    else location = 0.2;
  } else if (job.remote_allowed || candidate.remote_ok) {
    location = 1;
  }

  return clamp01(0.5 * salary + 0.5 * location);
}

/** Salary/location/seniority fit labels for the explainable match object. */
export function fitLabel(
  score01: number,
): "good" | "partial" | "poor" | "unknown" {
  if (!Number.isFinite(score01)) return "unknown";
  if (score01 >= 0.8) return "good";
  if (score01 >= 0.45) return "partial";
  return "poor";
}

// ---------------------------------------------------------------------------
// Seniority: experience-range + title-signal fit (0..1).
// ---------------------------------------------------------------------------

export function seniorityScore(
  job: Pick<JobReq, "experience_min" | "experience_max" | "seniority">,
  candidate: { total_experience_years?: number | null; seniority?: string | null },
): number {
  let exp = 1;
  const yrs = candidate.total_experience_years;
  if (yrs != null) {
    if (job.experience_min != null && yrs < job.experience_min) {
      exp = clamp01(yrs / Math.max(1, job.experience_min));
    } else if (job.experience_max != null && yrs > job.experience_max * 1.5) {
      exp = 0.6; // overqualified — mild penalty
    }
  }
  let title = 1;
  if (job.seniority && candidate.seniority) {
    title =
      job.seniority.toLowerCase() === candidate.seniority.toLowerCase()
        ? 1
        : 0.6;
  }
  return clamp01(0.7 * exp + 0.3 * title);
}

/** Deep-mode blend: 70% rules score + 30% LLM judge (both 0..100). */
export function blendWithJudge(rules0to100: number, judge0to100: number | null): number {
  if (judge0to100 == null || !Number.isFinite(judge0to100)) return rules0to100;
  return Math.round(0.7 * rules0to100 + 0.3 * judge0to100);
}
