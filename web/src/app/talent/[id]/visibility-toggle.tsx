"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function VisibilityToggle({
  id,
  initial,
}: {
  id: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const listed = value === "visible";

  const toggle = async () => {
    const next = listed ? "hidden" : "visible";
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, visibility_status: next }),
      });
      if (res.ok) {
        setValue(next);
        return;
      }
      if (res.status === 403) {
        setErr("Only the owning session can change this.");
        return;
      }
      if (res.status === 429) {
        setErr("Rate limited — try again in a minute.");
        return;
      }
      setErr("Couldn't change visibility.");
    } catch {
      setErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <span className="meta-chip">
        {listed ? (
          <Eye size={13} aria-hidden="true" />
        ) : (
          <EyeOff size={13} aria-hidden="true" />
        )}
        {listed ? "Listed in search" : "Unlisted"}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-sm press"
        onClick={() => void toggle()}
        disabled={busy}
      >
        {busy ? "Saving…" : listed ? "Take out of search" : "Put in search"}
      </button>
      {err ? (
        <span className="field-error" role="alert">
          {err}
        </span>
      ) : null}
    </span>
  );
}
