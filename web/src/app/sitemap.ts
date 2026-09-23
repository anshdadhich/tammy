import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/join`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/hire`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/hire/search`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
