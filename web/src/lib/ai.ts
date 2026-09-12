import { cheapModel, defaultOpenAIProvider } from "@/lib/matching/judge";

// Lightweight LLM helpers for summary + project depth (docs/13 §1-2).
// Always the CHEAP model (CHEAP_MODEL → JUDGE_MODEL → free default).
// Judge (top-10 evaluation) uses JUDGE_MODEL. All return null on missing key.

async function chat(system: string, user: string): Promise<string | null> {
  try {
    const provider = defaultOpenAIProvider(cheapModel());
    return await provider.complete({ system, user });
  } catch {
    return null;
  }
}

export async function generateCandidateSummary(input: {
  role: string; exp: string; domain: string; skills: string[];
  headline: string; projects: { title: string; description: string; tech: string; impact: string }[];
}): Promise<{ markdown: string; json: Record<string, unknown> } | null> {
  const system = `You are a factual talent analyst. Use ONLY provided data. No buzzwords, no exaggeration. Missing="Not specified." Output Markdown summary with: identity, core skills, evidence/project depth, outcomes, education, constraints, availability, gaps.`;
  const user = JSON.stringify(input).slice(0, 8000);
  const text = await chat(system, user);
  if (!text) return null;
  return { markdown: text.slice(0, 8000), json: { generated: true, at: new Date().toISOString() } };
}

export async function analyzeProjectDepth(p: {
  title: string; description: string; tech: string; role: string; impact: string;
}): Promise<Record<string, unknown> | null> {
  const system = `You are a senior technical evaluator. Return STRICT JSON only: {"technical_complexity":"low|medium|high|very_high","complexity_score":1-10,"architectural_concepts":[],"evidence_quality":"weak|moderate|strong","autonomy_level":"solo|contributed|led|unknown","relevance_tags":[],"strengths":[],"limitations":[]}. Use only provided info.`;
  const text = await chat(system, JSON.stringify(p).slice(0, 4000));
  if (!text) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch { /* fall through */ }
  return null;
}
