"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CandidateForm from "@/components/CandidateForm";
import AppNav from "@/components/AppNav";
import { setOwnerSession } from "@/lib/session";

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
      router.push(`/u/${j.candidateId}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
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
