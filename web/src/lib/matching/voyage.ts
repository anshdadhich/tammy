const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

export const VOYAGE_DEFAULT_MODEL = "voyage-4-lite";

export type VoyageInputType = "query" | "document";

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage?: { total_tokens: number };
}

function apiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  return key;
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    last = res;
    if (res.status !== 429 && res.status < 500) break;
    if (attempt < tries - 1) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  return last as Response;
}

const queryCache = new Map<string, { vec: number[]; at: number }>();
const QUERY_CACHE_TTL = 5 * 60 * 1000;

export async function embedTexts(
  texts: string[],
  opts: { input_type?: VoyageInputType; model?: string } = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { input_type = "document", model = VOYAGE_DEFAULT_MODEL } = opts;

  const clipped = texts.map((t) => (t.length > 8000 ? t.slice(0, 8000) : t));

  const res = await fetchWithRetry(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ input: clipped, model, input_type }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Voyage embeddings failed (${res.status}): ${body.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as VoyageEmbeddingResponse;
  const sorted = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
  if (sorted.length !== texts.length) {
    throw new Error(
      `Voyage returned ${sorted.length} embeddings for ${texts.length} inputs`,
    );
  }
  return sorted.map((d) => d.embedding);
}

export async function embedChunks(
  texts: string[],
  model = VOYAGE_DEFAULT_MODEL,
): Promise<number[][]> {
  return embedTexts(texts, { input_type: "document", model });
}

export async function embedQuery(
  text: string,
  model = VOYAGE_DEFAULT_MODEL,
): Promise<number[]> {
  const key = `${model}:${text.slice(0, 8000)}`;
  const hit = queryCache.get(key);
  if (hit && Date.now() - hit.at < QUERY_CACHE_TTL) return hit.vec;
  const [vec] = await embedTexts([text], { input_type: "query", model });
  queryCache.set(key, { vec, at: Date.now() });
  if (queryCache.size > 200) {
    const oldest = queryCache.keys().next().value;
    if (oldest) queryCache.delete(oldest);
  }
  return vec;
}

export function buildJobQueryText(job: {
  job_title: string;
  must_have_skills: string[];
  nice_to_have_skills?: string[];
  core_responsibilities?: string[];
  domain?: string;
}): string {
  const parts = [
    `Role: ${job.job_title}`,
    job.domain ? `Domain: ${job.domain}` : "",
    `Must-have: ${job.must_have_skills.join(", ")}`,
    job.nice_to_have_skills?.length
      ? `Nice-to-have: ${job.nice_to_have_skills.join(", ")}`
      : "",
    job.core_responsibilities?.length
      ? `Responsibilities: ${job.core_responsibilities.join("; ")}`
      : "",
  ].filter(Boolean);
  return parts.join("\n");
}
