import { driveFileId } from "@/lib/drive";

// GET /api/drive-check?url=... — anonymous reachability test for a Drive link.
// Mirrors exactly what HR sees (no login cookies). Does not download the file.
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ status: "invalid", reason: "not a URL" }, { status: 400 });
  }
  const id = driveFileId(url);
  if (!id) {
    // Not a Drive link: HEAD-check generic URLs, tolerate failure.
    try {
      const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
      return Response.json({ status: r.ok ? "reachable" : "unknown", http: r.status });
    } catch {
      return Response.json({ status: "unknown", reason: "unreachable or blocked" });
    }
  }
  try {
    const r = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, {
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
      // Virus-scan interstitial or confirm page: file IS shared, one extra click.
      return Response.json({ status: "reachable", note: "shared — large files may show one confirm screen" });
    }
    if (!r.ok) return Response.json({ status: "unknown", http: r.status });
    return Response.json({ status: "reachable" });
  } catch {
    return Response.json({ status: "unknown", reason: "check failed, try again" });
  }
}
