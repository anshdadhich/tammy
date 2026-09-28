import type { JobReq } from "./types";

export function buildFtsQueryText(job: JobReq, maxLen = 500): string {
  const skills = [...job.must_have_skills, ...job.nice_to_have_skills];
  return `${job.job_title} ${skills.join(" ")}`.slice(0, maxLen);
}

export function buildFtsTerms(job: JobReq, max = 20): string[] {
  const raw: string[] = [];
  for (const w of job.job_title.split(/[\s,;/|]+/)) {
    const t = w.trim();
    if (t.length >= 2) raw.push(t);
  }
  for (const s of [...job.must_have_skills, ...job.nice_to_have_skills]) {
    const t = s.trim();
    if (t.length >= 2) raw.push(t);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
