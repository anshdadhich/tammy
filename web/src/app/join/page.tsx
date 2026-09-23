"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CandidateForm from "@/components/CandidateForm";
import AppNav from "@/components/AppNav";
import DitherEffect from "@/components/DitherEffect";
import { setOwnerSession } from "@/lib/session";

export default function Start() {
  const router = useRouter();
  // Login gate: returning builders skip straight in; everyone else enters
  // an email so we can surface an existing page instead of duplicating it.
  // Starts at "check" on both server and hydration (no SSR mismatch); the
  // effect below upgrades returning owners straight to the builder.
  const [gate, setGate] = useState<"check" | "exists" | "build">("check");
  const [gateEmail, setGateEmail] = useState("");
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem("tammy_owner") ?? "null");
      if (o?.id && o?.email) setGate("build");
    } catch {
      /* ignore */
    }
  }, []);

  async function create(payload: Record<string, unknown>) {
    try {
      const r = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.candidateId) {
        const errs = j?.errors?.fieldErrors ?? j?.errors;
        const first = errs
          ? Object.entries(errs)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .slice(0, 3)
              .join(" · ")
          : (j?.error ?? "Could not create your page.");
        return { ok: false, error: first };
      }
      try {
        setOwnerSession({
          id: j.candidateId,
          email: String(payload.email ?? "").toLowerCase(),
        });
        if (Array.isArray(j.warnings) && j.warnings.length) {
          sessionStorage.setItem("tammy_warnings", JSON.stringify(j.warnings));
        } else {
          sessionStorage.removeItem("tammy_warnings");
        }
      } catch {
        /* private-mode browsing */
      }
      router.push(`/talent/${j.candidateId}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async function checkEmail(e?: React.FormEvent) {
    e?.preventDefault();
    const email = gateEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGateError("Enter a valid email to continue.");
      return;
    }
    setGateBusy(true);
    setGateError(null);
    try {
      const r = await fetch("/api/candidates/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setGateError(j?.error ?? "Lookup failed. Try again.");
        return;
      }
      if (j?.exists && j?.id) {
        setExistingId(String(j.id));
        setGate("exists");
      } else {
        setGate("build");
      }
    } catch (err) {
      setGateError((err as Error).message);
    } finally {
      setGateBusy(false);
    }
  }

  function testLogin() {
    // Demo shortcut: skip typing, explore the builder directly.
    setGate("build");
  }

  if (gate !== "build") {
    return (
      <div className="hire-login-page">
        <div className="hire-login-bg" aria-hidden="true">
          <DitherEffect colorFront="#1F2DE6" colorBack="#ffffff" scale={0.8} className="dither-soft" />
        </div>
        <AppNav />
        <main className="hire-login-main">
          <div className="hire-login-card">
            {gate === "check" ? (
              <>
                <span className="panel-eyebrow">Build my page</span>
                <h1>First, your login.</h1>
                <p className="hire-login-sub">Enter your email to log in. If you already have a page, we&apos;ll show it instead of building a duplicate.</p>
                <form onSubmit={checkEmail} noValidate>
                  <div className="field">
                    <label htmlFor="start-gate-email">Email</label>
                    <input
                      id="start-gate-email"
                      className="input"
                      type="email"
                      value={gateEmail}
                      onChange={(e) => setGateEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>
                  {gateError ? <p className="err" role="alert">{gateError}</p> : null}
                  <button className="btn-frame solid hire-login-go" type="submit" disabled={gateBusy}>
                    {gateBusy ? "Checking…" : "Continue →"}
                  </button>
                  <button className="btn-plain hire-login-test" type="button" onClick={testLogin}>
                    Use test login →
                  </button>
                </form>
              </>
            ) : (
              <>
                <span className="panel-eyebrow">Page found</span>
                <h1>You already have a page.</h1>
                <p className="hire-login-sub">Publishing again would create a duplicate. View your live page, or start fresh.</p>
                <div className="rowline" style={{ flexWrap: "wrap" }}>
                  {existingId ? <Link className="btn-frame solid" href={`/talent/${existingId}`}>View my page →</Link> : null}
                  <button className="btn-plain" type="button" onClick={() => setGate("build")}>
                    Build a new one anyway
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="onboard-page">
      <AppNav />
      <div className="onboard-backbar">
        <Link className="onboard-backlink" href="/">← Back to Tammy</Link>
      </div>
      <main className="onboard-main">
        <CandidateForm submitLabel="Publish my page →" onSubmit={create} />
      </main>
    </div>
  );
}
