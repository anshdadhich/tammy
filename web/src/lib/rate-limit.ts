type Bucket = { count: number; resetAt: number };

export interface RateLimitStore {
  get(key: string): Bucket | undefined;
  set(key: string, bucket: Bucket): void;
  delete(key: string): void;
}

const buckets = new Map<string, Bucket>();

const defaultStore: RateLimitStore = {
  get(key: string) {
    return buckets.get(key);
  },
  set(key: string, bucket: Bucket) {
    buckets.set(key, bucket);
  },
  delete(key: string) {
    buckets.delete(key);
  },
};

let activeStore: RateLimitStore = defaultStore;

export function configureRateLimitStore(store?: RateLimitStore | null): RateLimitStore {
  activeStore = store ?? defaultStore;
  return activeStore;
}

const IP_PATTERN = /^[A-Za-z0-9.:]{1,45}$/;

export function clientIp(request: Request): string {
  const h = request.headers;
  const xff = h.get("x-forwarded-for") ?? "";
  const hops = xff
    .split(",")
    .map((s) => s.trim().slice(0, 45))
    .filter((s) => s.length > 0);
  // First hop is the original client (proxies append to the right). The last
  // hop is our own edge proxy — using it collapses every visitor into one
  // shared bucket (≈10 OTP sends per 10 min site-wide). First hop is
  // client-spoofable, so treat per-IP limits as advisory; per-email
  // principal caps remain the real backstop.
  const clientHop = hops.length > 0 ? hops[0] : "";
  const direct = (h.get("x-real-ip") ?? "").trim().slice(0, 45);
  const candidate = clientHop || direct;
  if (candidate && IP_PATTERN.test(candidate)) return candidate;
  return "unknown";
}

export function rateLimit(
  request: Request,
  opts: { key: string; limit: number; windowMs: number; principal?: string },
): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const subject = (opts.principal ?? "").trim().slice(0, 160) || clientIp(request);
  const bucketKey = `${opts.key}:${subject}`;
  const cur = activeStore.get(bucketKey);
  if (!cur || now >= cur.resetAt) {
    activeStore.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, retryAfterMs: 0 };
  }
  if (cur.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: cur.resetAt - now };
  }
  cur.count += 1;
  activeStore.set(bucketKey, cur);
  return { ok: true, remaining: opts.limit - cur.count, retryAfterMs: 0 };
}

export function rateLimitRoute(
  request: Request,
  opts: { key: string; limit: number; windowMs: number; principal?: string },
): Response | null {
  const global = rateLimit(request, { key: "global", limit: 600, windowMs: 60_000 });
  if (!global.ok) return rateLimitResponse(global.retryAfterMs);
  const scoped = rateLimit(request, opts);
  if (!scoped.ok) return rateLimitResponse(scoped.retryAfterMs);
  return null;
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

declare global {
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
