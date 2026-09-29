import type { SupabaseClient } from "@supabase/supabase-js";
import type { JWK } from "@supabase/auth-js";

type Jwks = { keys: JWK[] };
type CacheState = {
  value: Jwks | null;
  expiresAt: number;
  pending: Promise<Jwks | null> | null;
};

const CACHE_TTL_MS = 5 * 60_000;

function cacheState(): CacheState {
  const root = globalThis as typeof globalThis & {
    __tammySupabaseJwksCache?: CacheState;
  };
  return (root.__tammySupabaseJwksCache ??= {
    value: null,
    expiresAt: 0,
    pending: null,
  });
}

async function readJwks(): Promise<Jwks | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;
  const state = cacheState();
  const now = Date.now();
  if (state.value && state.expiresAt > now) return state.value;
  if (state.pending) return state.pending;

  state.pending = (async () => {
    try {
      const url = new URL("/auth/v1/.well-known/jwks.json", baseUrl);
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return null;
      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys) || body.keys.length === 0) return null;
      const keys = body.keys
        .filter(
          (key): key is Record<string, unknown> & { kid: string; kty: string } =>
            !!key && typeof key === "object" &&
            typeof (key as { kid?: unknown }).kid === "string" &&
            typeof (key as { kty?: unknown }).kty === "string",
        )
        .map(
          (key) =>
            ({
              ...key,
              key_ops: Array.isArray(key.key_ops) ? key.key_ops : ["verify"],
            }) as JWK,
        );
      if (keys.length === 0) return null;
      const value = { keys };
      state.value = value;
      state.expiresAt = Date.now() + CACHE_TTL_MS;
      return value;
    } catch {
      // Supabase's client retains its own fallback behavior when this shared
      // cache is unavailable, including fetching the active signing key.
      return null;
    } finally {
      state.pending = null;
    }
  })();
  return state.pending;
}

/**
 * Verify the access token with a process-shared JWKS cache. Supabase's
 * per-client key cache is lost because SSR clients are request-scoped; without
 * this cache, a fresh JWKS request can block every page render.
 */
export async function getVerifiedClaims(client: SupabaseClient) {
  // Avoid fetching the signing-key document for anonymous traffic. getSession
  // is used only as a presence check here; its user object is never trusted.
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) return client.auth.getClaims();
  const jwks = await readJwks();
  return client.auth.getClaims(undefined, jwks ? { jwks } : undefined);
}
