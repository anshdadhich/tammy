/**
 * Step 4 (Judge): LLM deep evaluation over top-10 candidates.
 *
 * Prompt: docs/13 §4 (rubric: depth / relevance / impact / red-flags).
 * Output : docs/13 §5 explainable match object (subset parsed here).
 *
 * Provider is abstract so search can run on any cheap chat model
 * (default: GPT-4o-mini-class). Bring your own key via env.
 */

import type { JobReq, MatchLevel } from "./types";

export interface JudgeInput {
  job: JobReq;
  /** Structured candidate JSON: summary + project_depth + work exp. */
  candidateJson: Record<string, unknown>;
  candidate_id: string;
}

export interface JudgeResult {
  candidate_id: string;
  overall_score: number; // 0..100 (maps from total_score)
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
  raw?: unknown;
}

/** Minimal chat-completions surface any provider adapter must satisfy. */
export interface JudgeProvider {
  name: string;
  /** Returns raw text (expected: strict JSON per JUDGE_SYSTEM_PROMPT). */
  complete(prompt: { system: string; user: string }): Promise<string>;
}

export const JUDGE_SYSTEM_PROMPT = `You are an expert Technical Hiring Manager. Evaluate the candidate for the role. No keyword matching — look for evidence of capability and depth.
Score 4 dimensions (each 0-25):
1. TECHNICAL DEPTH: CRUD vs hard problems (caching, concurrency, state, design)? Scale/hurdles overcome?
2. RELEVANCE: does actual past work map to the job's actual problems?
3. IMPACT/OWNERSHIP: owned vs assisted? Metrics or tutorial clone?
4. RED FLAGS (inverted: 25 = clean, 0 = severe): bootcamp clone, buzzword list with no context, role-complexity mismatch.
Rules: use ONLY provided info, mark gaps explicitly, be critical and objective, no vague praise.
Output STRICT JSON only, exactly this shape:
{"total_score":0,"technical_depth_score":0,"relevance_score":0,"impact_score":0,"red_flags_score":0,"best_project_match":"","why_they_are_a_good_fit":"","potential_interview_questions":["",""],"weaknesses_or_gaps":"","matched_requirements":[],"missing_requirements":[],"strengths":[],"risk_factors":[]}`;

export function buildJudgeUserPrompt(job: JobReq, candidateJson: unknown): string {
  return `JOB:\n${JSON.stringify(
    {
      title: job.job_title,
      domain: job.domain,
      seniority: job.seniority,
      must_have: job.must_have_skills,
      nice_to_have: job.nice_to_have_skills,
      exp_min: job.experience_min,
      responsibilities: job.core_responsibilities,
      implied_needs: job.implied_technical_needs,
      description: job.raw_description.slice(0, 4000),
    },
    null,
    2,
  )}\n\nCANDIDATE:\n${JSON.stringify(candidateJson).slice(0, 12000)}`;
}

/** Default provider: OpenAI-compatible chat completions (OpenRouter by default). */
export const DEFAULT_CHEAP_MODEL = "minimax/minimax-m3:free";

export function cheapModel(): string {
  return process.env.CHEAP_MODEL ?? process.env.JUDGE_MODEL ?? DEFAULT_CHEAP_MODEL;
}

export function defaultOpenAIProvider(
  model = process.env.JUDGE_MODEL ?? DEFAULT_CHEAP_MODEL,
): JudgeProvider {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY ?? "";
  const baseUrl =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return {
    name: `openai:${model}`,
    async complete({ system, user }) {
      if (!apiKey) throw new Error("OPENROUTER_API_KEY (or LLM_API_KEY) is not set");
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(siteUrl ? { "HTTP-Referer": siteUrl, "X-Title": "Reverse Hiring MVP" } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Judge LLM failed (${res.status}): ${body.slice(0, 500)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content) throw new Error("Judge LLM returned empty content");
      return content;
    },
  };
}

function toScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function toMatchLevel(total: number): MatchLevel {
  if (total >= 75) return "strong";
  if (total >= 50) return "partial";
  return "weak";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Parse + normalize one raw judge JSON string into a JudgeResult. */
export function parseJudgeOutput(
  candidate_id: string,
  rawText: string,
): JudgeResult {
  // Strip code fences if the model added them despite instructions.
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(`Judge output was not valid JSON: ${cleaned.slice(0, 200)}`);
  }

  const total =
    raw.total_score != null
      ? toScore(raw.total_score)
      : toScore(
          Number(raw.technical_depth_score ?? 0) +
            Number(raw.relevance_score ?? 0) +
            Number(raw.impact_score ?? 0) +
            Number(raw.red_flags_score ?? 0),
        );

  const gapsStr =
    typeof raw.weaknesses_or_gaps === "string" && raw.weaknesses_or_gaps
      ? [raw.weaknesses_or_gaps]
      : [];

  return {
    candidate_id,
    overall_score: total,
    match_level: toMatchLevel(total),
    matched_requirements: strArr(raw.matched_requirements),
    missing_requirements: strArr(raw.missing_requirements),
    project_evidence: typeof raw.best_project_match === "string" && raw.best_project_match
      ? [raw.best_project_match]
      : [],
    strengths: strArr(raw.strengths),
    gaps: gapsStr,
    risk_factors: strArr(raw.risk_factors),
    salary_fit: "unknown",
    location_fit: "unknown",
    seniority_fit: "unknown",
    recommendation:
      typeof raw.why_they_are_a_good_fit === "string"
        ? raw.why_they_are_a_good_fit
        : "",
    interview_questions: strArr(raw.potential_interview_questions).slice(0, 5),
    raw,
  };
}

/** Judge a single candidate with the given (or default) provider. */
export async function judgeCandidate(
  input: JudgeInput,
  provider: JudgeProvider = defaultOpenAIProvider(),
): Promise<JudgeResult> {
  const text = await provider.complete({
    system: JUDGE_SYSTEM_PROMPT,
    user: buildJudgeUserPrompt(input.job, input.candidateJson),
  });
  return parseJudgeOutput(input.candidate_id, text);
}

/**
 * Judge top-N candidates in parallel (docs/07: ~3-5s for the batch).
 * Failures resolve to null so one bad call doesn't kill the search.
 */
export async function judgeTop(
  inputs: JudgeInput[],
  provider: JudgeProvider = defaultOpenAIProvider(),
  concurrency = 10,
): Promise<Array<JudgeResult | null>> {
  const queue = [...inputs];
  const out: Array<JudgeResult | null> = new Array(inputs.length).fill(null);
  const workers = Array.from(
    { length: Math.min(concurrency, inputs.length) },
    async () => {
      while (queue.length) {
        const idx = inputs.length - queue.length;
        const item = queue.shift()!;
        try {
          out[idx] = await judgeCandidate(item, provider);
        } catch {
          out[idx] = null;
        }
      }
    },
  );
  await Promise.all(workers);
  return out;
}
