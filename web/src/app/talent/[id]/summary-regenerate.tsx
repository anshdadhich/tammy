"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export default function SummaryRegenerate({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const regenerate = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/candidates/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      if (res.status === 403) {
        setErr("Only the owning session can do this.");
        return;
      }
      if (res.status === 429) {
        setErr("Rate limited - try again in an hour.");
        return;
      }
      setErr("Couldn't start regeneration.");
    } catch {
      setErr("Network error - try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        className="btn btn-secondary btn-sm press"
        onClick={() => void regenerate()}
        disabled={busy || done}
      >
        <RefreshCw size={13} aria-hidden="true" />
        {done ? "Regenerating…" : busy ? "Starting…" : "Regenerate summary"}
      </button>
      {done ? (
        <span className="field-hint">A fresh summary is being written - refresh in a minute.</span>
      ) : null}
      {err ? (
        <span className="field-error" role="alert">
          {err}
        </span>
      ) : null}
    </span>
  );
}
