// In-memory token-bucket rate limiter for API routes.
// Per-instance only (resets on redeploy) — sufficient to stop casual
// enumeration / spam / SSRF probing until Upstash/Redis lands.
// Never throws; fail-open when headers missing.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientIp(request: Request): string {
  const h = request.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return h.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimit(
  request: Request,
  opts: { key: string; limit: number; windowMs: number },
): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const bucketKey = `${opts.key}:${clientIp(request)}`;
  const cur = buckets.get(bucketKey);
  if (!cur || now >= cur.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }
  if (cur.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: cur.resetAt - now };
  }
  cur.count += 1;
  return { ok: true, remaining: opts.limit - cur.count, retryAfterMs: 0 };
}

export function rateLimitResponse(retryAfterMs: number) {
  return Response.json(
    { error: "Too many requests. Slow down and try again." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    },
  );
}

// Prune stale buckets every 5 min (timer unref'd so it never blocks exit).
declare global {
  // eslint-disable-next-line no-var
  var __tammyRateLimitPrune: NodeJS.Timeout | undefined;
}
if (!globalThis.__tammyRateLimitPrune) {
  globalThis.__tammyRateLimitPrune = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }, 5 * 60 * 1000);
  const t = globalThis.__tammyRateLimitPrune as unknown as { unref?: () => void };
  if (typeof t.unref === "function") t.unref();
}
