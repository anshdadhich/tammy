import { redactPii } from "@/lib/redact";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

export const VOYAGE_DEFAULT_MODEL = "voyage-4-lite";

export const EMBEDDING_MODEL = VOYAGE_DEFAULT_MODEL;
export const EMBEDDING_DIM = 1024;
export const VOYAGE_TIMEOUT_MS = 15000;

export type VoyageInputType = "query" | "document";

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage?: { total_tokens: number };
}

export function assertEmbeddingDim(vec: unknown, expected = EMBEDDING_DIM): asserts vec is number[] {
  if (!Array.isArray(vec) || vec.length !== expected) {
    throw new Error(`Embedding dim mismatch: got ${Array.isArray(vec) ? vec.length : typeof vec}, expected ${expected}`);
  }
  for (const v of vec) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`Embedding contains non-finite value, expected ${expected} finite numbers`);
    }
  }
}

export function toVectorLiteral(vec: number[], expected = EMBEDDING_DIM): string {
  assertEmbeddingDim(vec, expected);
  return `[${vec.join(",")}]`;
}

function apiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");
  return key;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  tries = 3,
  timeoutMs = VOYAGE_TIMEOUT_MS,
): Promise<Response> {
  let last: Response | null = null;
  let lastErr: unknown = null;
  let retryAfterMs: number | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
      const res = await fetch(url, { ...init, signal });
      if (res.ok) return res;
      last = res;
      if (res.status === 429) {
        const ra = res.headers.get("retry-after");
        if (ra) {
          const secs = Number(ra);
          if (Number.isFinite(secs) && secs > 0) retryAfterMs = Math.min(secs * 1000, 60000);
          else {
            const date = Date.parse(ra);
            if (Number.isFinite(date)) retryAfterMs = Math.min(Math.max(date - Date.now(), 0), 60000);
          }
        }
      }
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastErr = e;
      retryAfterMs = null;
    }
    if (attempt < tries - 1) {
      await new Promise((r) => setTimeout(r, retryAfterMs ?? 400 * 2 ** attempt));
      retryAfterMs = null;
    }
  }
  if (last) return last;
  throw lastErr instanceof Error ? lastErr : new Error("Voyage request failed");
}

const queryCache = new Map<string, { vec: number[]; at: number }>();
const QUERY_CACHE_TTL = 5 * 60 * 1000;
const QUERY_CACHE_MAX = 500;

export async function embedTexts(
  texts: string[],
  opts: { input_type?: VoyageInputType; model?: string; timeoutMs?: number } = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { input_type = "document", model = VOYAGE_DEFAULT_MODEL, timeoutMs = VOYAGE_TIMEOUT_MS } = opts;

  const clipped = texts.map((t) => (t.length > 8000 ? t.slice(0, 8000) : t));

  const res = await fetchWithRetry(
    VOYAGE_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({ input: clipped, model, input_type }),
    },
    3,
    timeoutMs,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[voyage] embeddings failed status=${res.status} inputs=${texts.length} detail=${redactPii(body.slice(0, 200))}`);
    throw new Error(`Voyage embeddings failed (${res.status})`);
  }

  const json = (await res.json()) as VoyageEmbeddingResponse;
  const sorted = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
  if (sorted.length !== texts.length) {
    throw new Error(
      `Voyage returned ${sorted.length} embeddings for ${texts.length} inputs`,
    );
  }
  const out = sorted.map((d) => d.embedding);
  for (const vec of out) assertEmbeddingDim(vec);
  return out;
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
  opts: { timeoutMs?: number } = {},
): Promise<number[]> {
  const key = `${model}:${text.slice(0, 8000)}`;
  const hit = queryCache.get(key);
  if (hit && Date.now() - hit.at < QUERY_CACHE_TTL) {
    queryCache.delete(key);
    queryCache.set(key, hit);
    return hit.vec;
  }
  const [vec] = await embedTexts([text], { input_type: "query", model, timeoutMs: opts.timeoutMs });
  assertEmbeddingDim(vec);
  queryCache.set(key, { vec, at: Date.now() });
  if (queryCache.size > QUERY_CACHE_MAX) {
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
