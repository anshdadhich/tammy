import type { MetadataRoute } from "next";

function resolveSiteBase(): string {
  const fallback = "https://example.com";
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return process.env.NODE_ENV === "production" ? fallback : "http://localhost:3000";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return fallback;
    if (process.env.NODE_ENV === "production" && u.protocol !== "https:") return fallback;
    return u.origin;
  } catch {
    return process.env.NODE_ENV === "production" ? fallback : "http://localhost:3000";
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolveSiteBase();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/join`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/hire`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/hire/search`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
