"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Lookup() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/candidates?email=${encodeURIComponent(email.trim())}`);
      const j = await r.json();
      if (!r.ok || !j?.candidate?.id) {
        setError(j?.error ?? "No page found for that email yet.");
        return;
      }
      router.push(`/u/${j.candidate.id}`);
    } catch {
      setError("Lookup failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={open}>
      <div className="rowline">
        <input
          className="input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button className="btn-frame" type="submit" disabled={busy}>
          <span className="h tl"></span>
          <span className="h tr"></span>
          <span className="h bl"></span>
          <span className="h br"></span>
          {busy ? "…" : "Open →"}
        </button>
      </div>
      {error ? <p className="err" style={{ marginTop: 8 }}>{error}</p> : null}
    </form>
  );
}
