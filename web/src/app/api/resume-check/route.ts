import { driveFileId } from "@/lib/drive";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rl = rateLimit(request, { key: "resume-check", limit: 30, windowMs: 10 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!/^https?:\/\//i.test(url) || url.length > 2048) {
    return Response.json({ status: "invalid", reason: "not a URL" }, { status: 400 });
  }
  const id = driveFileId(url);
  if (!id) {
    return Response.json(
      { status: "invalid", reason: "only Google Drive links can be checked" },
      { status: 400 },
    );
  }
  try {
    const r = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ReverseHiring-check/1.0)" },
    });
    const ct = r.headers.get("content-type") ?? "";
    const finalUrl = r.url;
    if (/accounts\.google\.com|ServiceLogin/i.test(finalUrl)) {
      return Response.json({ status: "restricted", reason: "Google asks to log in — sharing is off" });
    }
    if (r.status === 403 || r.status === 404) {
      return Response.json({ status: "restricted", reason: `Google returned ${r.status}` });
    }
    if (ct.includes("text/html")) {
      return Response.json({ status: "reachable", note: "shared — large files may show one confirm screen" });
    }
    if (!r.ok) return Response.json({ status: "unknown", http: r.status });
    return Response.json({ status: "reachable" });
  } catch {
    return Response.json({ status: "unknown", reason: "check failed, try again" });
  }
}
