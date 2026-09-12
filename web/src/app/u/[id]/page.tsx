"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import Portfolio, { type Bundle } from "@/components/Portfolio";

export default function PublicProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    try {
      const w = JSON.parse(sessionStorage.getItem("tammy_warnings") ?? "null");
      if (Array.isArray(w) && w.length) setWarnings(w);
      sessionStorage.removeItem("tammy_warnings");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`/api/candidates?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((j) => {
        if (!live) return;
        setBundle(j);
        try {
          const owner = JSON.parse(localStorage.getItem("tammy_owner") ?? "null");
          if (
            owner?.id === id &&
            String(owner?.email ?? "").toLowerCase() ===
              String(j?.candidate?.contact_email ?? "").toLowerCase()
          ) {
            setIsOwner(true);
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (live) setError("This page doesn't exist or is hidden.");
      });
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <div>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 20px 0" }}>
        <Link className="brand" href="/">
          Tammy <small>· Beta</small>
        </Link>
      </div>
      {!bundle && !error ? <p className="loading">Loading page…</p> : null}
      {warnings.length ? (
        <div className="form-card" style={{ maxWidth: 640, margin: "0 auto 16px", borderColor: "#b3261e" }}>
          <h3>Page created, but something didn&apos;t save</h3>
          {warnings.map((w) => (
            <p className="err" key={w}>{w}</p>
          ))}
          <p style={{ marginTop: 8 }}>
            <Link className="btn-plain" href={`/u/${id}/edit`}>Fix it in the edit section →</Link>
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="wrap center">
          <p style={{ marginBottom: 16 }}>{error}</p>
          <Link className="btn-frame" href="/start">
            <span className="h tl"></span>
            <span className="h tr"></span>
            <span className="h bl"></span>
            <span className="h br"></span>
            Build your page
          </Link>
        </div>
      ) : null}
      {bundle ? <Portfolio bundle={bundle} mode="public" editHref={`/u/${id}/edit`} isOwner={isOwner} /> : null}
    </div>
  );
}
