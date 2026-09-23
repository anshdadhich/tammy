"use client";

/* Arbitrary candidate-supplied photo URLs render as plain <img> with
   lazy loading — precedent set in next.config.ts (avatars). */
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

export default function Avatar({
  name,
  src,
  size = 48,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const usable = src && /^https?:\/\//.test(src) && !failed;

  if (!usable) {
    return (
      <span
        aria-hidden="true"
        className="grid place-items-center rounded-full bg-brand-soft text-brand-text font-semibold select-none"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="rounded-full object-cover bg-inset"
      style={{ width: size, height: size }}
    />
  );
}
