import { cheapModel, defaultOpenAIProvider } from "@/lib/matching/judge";

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
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const complexity = Math.min(10, Math.max(1, Math.round(Number(parsed.complexity_score) || 5)));
    const tech = ["low", "medium", "high", "very_high"].includes(String(parsed.technical_complexity))
      ? String(parsed.technical_complexity) : "medium";
    const evidence = ["weak", "moderate", "strong"].includes(String(parsed.evidence_quality))
      ? String(parsed.evidence_quality) : "moderate";
    const autonomy = ["solo", "contributed", "led", "unknown"].includes(String(parsed.autonomy_level))
      ? String(parsed.autonomy_level) : "unknown";
    return { ...parsed, complexity_score: complexity, technical_complexity: tech, evidence_quality: evidence, autonomy_level: autonomy };
  } catch {  }
  return null;
}
