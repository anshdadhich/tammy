"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CandidateForm from "@/components/CandidateForm";

export default function Start() {
  const router = useRouter();

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
        localStorage.setItem(
          "tammy_owner",
          JSON.stringify({ id: j.candidateId, email: String(payload.email ?? "").toLowerCase() }),
        );
        if (Array.isArray(j.warnings) && j.warnings.length) {
          sessionStorage.setItem("tammy_warnings", JSON.stringify(j.warnings));
        } else {
          sessionStorage.removeItem("tammy_warnings");
        }
      } catch {
        /* private-mode browsing */
      }
      router.push(`/u/${j.candidateId}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <Link className="brand" href="/">
          Tammy <small>· Beta</small>
        </Link>
        <Link className="btn-plain" href="/">
          ← Back
        </Link>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>
        Build your page.
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24, maxWidth: 560 }}>
        This is your signup — everything you enter becomes your public
        portfolio page. Salary, location prefs and availability stay private
        and are only used for matching.
      </p>
      <CandidateForm submitLabel="Create my page →" onSubmit={create} />
    </div>
  );
}
