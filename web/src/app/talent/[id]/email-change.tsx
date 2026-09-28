"use client";

import { useState } from "react";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailChange({ id, current }: { id: string; current: string }) {
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const change = async () => {
    const email = next.trim().toLowerCase();
    if (email.length > 320 || !EMAIL_OK.test(email) || busy) return;
    if (email === current.trim().toLowerCase()) {
      setErr("That is already the email on this profile.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const tr = await fetch("/api/session/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, newEmail: email }),
      });
      const tb = (await tr.json().catch(() => null)) as {
        token?: string;
        error?: string;
      } | null;
      if (!tr.ok || typeof tb?.token !== "string") {
        setErr(tb?.error ?? "Could not verify the new address.");
        return;
      }
      const pr = await fetch("/api/candidates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, email, email_change_token: tb.token }),
      });
      const pb = (await pr.json().catch(() => null)) as { error?: string } | null;
      if (!pr.ok) {
        setErr(pb?.error ?? "Could not save the new address.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className="field-hint">
        Email updated — future sign-in codes go to {next.trim().toLowerCase()}.
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <input
        className="input"
        style={{ maxWidth: 260 }}
        value={next}
        onChange={(e) => {
          setNext(e.target.value);
          setErr(null);
        }}
        placeholder={current || "new@email.com"}
        inputMode="email"
        autoComplete="email"
        maxLength={320}
        aria-label="New account email"
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm press"
        onClick={() => void change()}
        disabled={busy}
      >
        {busy ? "Saving…" : "Change email"}
      </button>
      {err ? (
        <span className="field-error" role="alert">
          {err}
        </span>
      ) : null}
    </span>
  );
}
