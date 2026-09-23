"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CandidateForm, {
  bundleToForm,
  type FormState,
} from "@/components/CandidateForm";
import type { Bundle } from "@/components/Portfolio";
import { useLogoutRedirect } from "@/lib/session";

export default function EditProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  // If the owner logs out (any tab) while editing, leave immediately —
  // the server would reject every write anyway.
  useLogoutRedirect("/join");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/candidates?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((j) => {
        if (!live) return;
        setBundle(j);
        setInitial(bundleToForm(j));
        try {
          const owner = JSON.parse(localStorage.getItem("tammy_owner") ?? "null");
          if (
            owner?.id === id &&
            typeof owner?.email === "string" &&
            owner.email.toLowerCase() === String(j?.candidate?.contact_email ?? "").toLowerCase()
          ) {
            setUnlocked(true);
          } else if (owner?.email) {
            setEmail(owner.email);
            setSavedEmail(owner.email);
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (live) setGateError("Page not found.");
      });
    return () => {
      live = false;
    };
  }, [id]);

  // Keep the session email in sync after a successful email change, so the
  // server-side ownership cross-check (cookie email vs candidate row) keeps
  // matching. PATCH /api/session/owner updates the tammy_owner cookie.
  async function syncOwnerEmail(newEmail: string) {
    try {
      const owner = JSON.parse(localStorage.getItem("tammy_owner") ?? "null");
      if (owner?.id === id) {
        await fetch("/api/session/owner", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, email: newEmail }),
        });
        localStorage.setItem(
          "tammy_owner",
          JSON.stringify({ id, email: newEmail.toLowerCase() }),
        );
      }
    } catch {
      /* ignore */
    }
  }

  function unlock(e: React.FormEvent) {
    e.preventDefault();
    // A signed-in owner of a DIFFERENT page can never edit this one: the
    // server cross-checks the session against the candidate row, so even a
    // matching email would 403. Tell them to switch accounts instead.
    try {
      const session = JSON.parse(localStorage.getItem("tammy_owner") ?? "null");
      if (session?.id && session.id !== id) {
        setGateError(
          `You're signed in as ${String(session.email ?? "another candidate")}, but this page belongs to a different candidate. Log out first, then confirm with this page's signup email.`,
        );
        return;
      }
    } catch {
      /* no session — proceed with the email gate */
    }
    const want = email.trim().toLowerCase();
    const actual = String(bundle?.candidate?.contact_email ?? "").toLowerCase();
    if (want && want === actual) {
      setUnlocked(true);
      setGateError(null);
    } else {
      setGateError("That email doesn't match this page's signup email.");
    }
  }

  async function save(payload: Record<string, unknown>) {
    try {
      const r = await fetch("/api/candidates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const errs = j?.errors?.fieldErrors ?? j?.errors;
        const first = errs
          ? Object.entries(errs)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .slice(0, 3)
              .join(" · ")
          : (j?.error ?? "Could not save.");
        return { ok: false, error: first };
      }
      try {
        if (Array.isArray(j.warnings) && j.warnings.length) {
          sessionStorage.setItem("tammy_warnings", JSON.stringify(j.warnings));
        } else {
          sessionStorage.removeItem("tammy_warnings");
        }
      } catch {
        /* ignore */
      }
      router.push(`/talent/${id}`);
      router.refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  async function uploadPhoto(file: File) {
    setPhotoMsg("Uploading…");
    try {
      const fd = new FormData();
      fd.set("kind", "photo");
      fd.set("candidate_id", id);
      fd.set("file", file);
      const r = await fetch("/api/uploads", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPhotoMsg(j?.error ?? "Upload failed.");
        return;
      }
      setPhotoMsg("Photo updated — it shows on your page now.");
    } catch (e) {
      setPhotoMsg((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm("Delete this page permanently? This cannot be undone.")) return;
    const r = await fetch(`/api/candidates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) {
      setDeleted(true);
      try {
        localStorage.removeItem("tammy_owner");
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <Link className="brand" href="/">
          Tammy <small>· Beta</small>
        </Link>
        <Link className="btn-plain" href={`/talent/${id}`}>
          ← View page
        </Link>
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>
        Edit your page.
      </h1>

      {!bundle && !gateError ? <p className="loading">Loading…</p> : null}
      {deleted ? (
        <p className="oknote">Page deleted. <Link href="/join">Create a new one →</Link></p>
      ) : null}

      {bundle && !unlocked ? (
        <div className="form-card">
          <h3>Confirm it&apos;s you</h3>
          <p>Enter the email you signed up with to edit this page.</p>
          <form onSubmit={unlock}>
            <div className="rowline">
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button className="btn-frame" type="submit">
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                Unlock
              </button>
              {savedEmail ? (
                <button
                  className="btn-frame"
                  type="button"
                  onClick={() => setEmail(savedEmail)}
                >
                  <span className="h tl"></span>
                  <span className="h tr"></span>
                  <span className="h bl"></span>
                  <span className="h br"></span>
                  ⚡ Fill saved email
                </button>
              ) : null}
            </div>
          </form>
          {gateError ? <p className="err" style={{ marginTop: 8 }}>{gateError}</p> : null}
        </div>
      ) : null}

      {bundle && unlocked && initial ? (
        <>
          <div className="form-card">
            <h3>Photo upload</h3>
            <p>JPG or PNG, max 10MB. Replaces your avatar immediately.</p>
            <input
              type="file"
              accept=".jpg,.jpeg,.png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
              }}
            />
            {photoMsg ? <p className="oknote" style={{ marginTop: 8 }}>{photoMsg}</p> : null}
          </div>
          <CandidateForm
            initial={initial}
            submitLabel="Save changes →"
            onSubmit={async (payload) => {
              const res = await save(payload);
              if (res.ok && typeof payload.email === "string") {
                await syncOwnerEmail(payload.email.toLowerCase());
              }
              return res;
            }}
          />
          <div style={{ marginTop: 28 }}>
            <button className="btn-plain" onClick={remove} type="button">
              Delete this page permanently
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
