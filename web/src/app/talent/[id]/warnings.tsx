"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Post-create warnings survive the redirect via sessionStorage (client-only).
export default function WarningsGate({ id }: { id: string }) {
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
  if (!warnings.length) return null;
  return (
    <div className="form-card" style={{ maxWidth: 640, margin: "0 auto 16px", borderColor: "#b3261e" }}>
      <h3>Page created, but something didn&apos;t save</h3>
      {warnings.map((w) => (
        <p className="err" role="alert" key={w}>{w}</p>
      ))}
      <p style={{ marginTop: 8 }}>
        <Link className="btn-plain" href={`/talent/${id}/edit`}>Fix it in the edit section →</Link>
      </p>
    </div>
  );
}
