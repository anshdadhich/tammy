import type { JobReq } from "@/lib/matching/types";

// Live transparent scoring, computed against the REAL schema in /api/search.
// Five sub-scores (0..1) blended 0.25/0.25/0.20/0.15/0.10 into 0..100.

export interface SubScores {
  semantic: number;
  skill: number;
  depth: number;
  constraints: number;
  seniority: number;
}

export interface ScoreContext {
  skills: string[]; // canonical skill names
  skillProjects: Map<string, number>; // lowercase skill -> # projects using it
  depths: { complexity: number; evidence: string }[]; // per-project depth
  minSalary: number | null;
  totalExp: number | null;
  remotePref: string | null;
  locationCity: string | null;
  availability: string | null;
  profileStrength: number | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function semanticFromDistance(distance: number | null | undefined): number {
  if (distance == null || !isFinite(distance)) return 0.5;
  // pgvector cosine distance: 0 = identical. Map 0..1.2 -> 1..0.
  return clamp01(1 - distance / 1.2);
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function skillScore(job: JobReq, ctx: ScoreContext): number {
  const must = job.must_have_skills ?? [];
  const nice = job.nice_to_have_skills ?? [];
  if (!must.length && !nice.length) return 0.5;
  const have = new Set(ctx.skills.map(norm));
  const evidence = (s: string): number => {
    const n = ctx.skillProjects.get(norm(s)) ?? 0;
    if (n >= 2) return 1;
    if (n === 1) return 0.7;
    return have.has(norm(s)) ? 0.4 : 0; // listed but unproven
  };
  const mustHit = must.length
    ? must.reduce((a, s) => a + evidence(s), 0) / must.length
    : 1;
  const niceHit = nice.length
    ? nice.reduce((a, s) => a + evidence(s), 0) / nice.length
    : 1;
  return clamp01(mustHit * 0.75 + niceHit * 0.25);
}

const EVIDENCE_MAP: Record<string, number> = { weak: 0.3, moderate: 0.65, strong: 1 };

export function depthScore(ctx: ScoreContext): number {
  if (!ctx.depths.length) return 0.3;
  const avg = ctx.depths.reduce((a, d) => a + clamp01(d.complexity / 10), 0) / ctx.depths.length;
  const ev = ctx.depths.reduce((a, d) => a + (EVIDENCE_MAP[d.evidence] ?? 0.5), 0) / ctx.depths.length;
  const quality = clamp01((ctx.profileStrength ?? 50) / 100);
  return clamp01(avg * 0.5 + ev * 0.35 + quality * 0.15);
}

export function constraintsScore(job: JobReq, ctx: ScoreContext): number {
  let salary = 0.5;
  if (job.salary_max != null && ctx.minSalary != null) {
    salary = ctx.minSalary <= job.salary_max ? 1 : ctx.minSalary <= job.salary_max * 1.2 ? 0.4 : 0;
  } else if (ctx.minSalary != null) salary = 0.7;
  let location = 0.5;
  const remoteOk = job.remote_allowed || ctx.remotePref === "remote_only" || ctx.remotePref === "flexible";
  if (job.remote_allowed && (ctx.remotePref === "remote_only" || ctx.remotePref === "flexible")) location = 1;
  else if (!job.location) location = 0.8;
  else if (remoteOk) location = 0.8;
  else location = 0.2;
  const avail = !ctx.availability || /immedi/i.test(ctx.availability) ? 1 : /notice/i.test(ctx.availability) ? 0.6 : 0.4;
  return clamp01(salary * 0.4 + location * 0.35 + avail * 0.25);
}

export function seniorityScore(job: JobReq, ctx: ScoreContext): number {
  if (ctx.totalExp == null) return 0.5;
  const { experience_min: lo, experience_max: hi } = job;
  if (lo == null && hi == null) return 0.7;
  if (lo != null && ctx.totalExp < lo) return clamp01(0.5 - (lo - ctx.totalExp) * 0.2);
  if (hi != null && ctx.totalExp > hi) return clamp01(0.7 - (ctx.totalExp - hi) * 0.1);
  return 1;
}

export const WEIGHTS = { semantic: 0.25, skill: 0.25, depth: 0.2, constraints: 0.15, seniority: 0.1 };

export function finalScore(sub: SubScores): number {
  return Math.round(
    (sub.semantic * WEIGHTS.semantic +
      sub.skill * WEIGHTS.skill +
      sub.depth * WEIGHTS.depth +
      sub.constraints * WEIGHTS.constraints +
      sub.seniority * WEIGHTS.seniority) *
      100,
  );
}

export function matchLevel(total: number): "strong" | "partial" | "weak" {
  if (total >= 75) return "strong";
  if (total >= 50) return "partial";
  return "weak";
}

export function scoreCandidate(job: JobReq, distance: number | null, ctx: ScoreContext): { sub: SubScores; total: number; level: "strong" | "partial" | "weak" } {
  const sub: SubScores = {
    semantic: semanticFromDistance(distance),
    skill: skillScore(job, ctx),
    depth: depthScore(ctx),
    constraints: constraintsScore(job, ctx),
    seniority: seniorityScore(job, ctx),
  };
  const total = finalScore(sub);
  return { sub, total, level: matchLevel(total) };
}

export function blendWithJudge(rules0to100: number, judge0to100: number | null): number {
  if (judge0to100 == null) return rules0to100;
  return Math.round(rules0to100 * 0.7 + judge0to100 * 0.3);
}
