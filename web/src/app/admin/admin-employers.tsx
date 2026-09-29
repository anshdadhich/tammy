"use client";

import { useEffect, useState } from "react";

type Employer = {
  id: string;
  company_name: string | null;
  company_email: string | null;
  website: string | null;
  linkedin_url: string | null;
  company_size: string | null;
  industry: string | null;
  verification_status: string | null;
  created_at: string | null;
  account_email: string | null;
};

function registrableHost(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

function emailDomain(v: string | null): string | null {
  if (!v) return null;
  const at = v.toLowerCase().indexOf("@");
  if (at < 0) return null;
  const host = v.slice(at + 1).replace(/^www\./, "");
  if (!host.includes(".")) return null;
  return host;
}

function domainMatch(e: Employer): boolean {
  const site = registrableHost(e.website);
  if (!site) return false;
  const mail = emailDomain(e.account_email ?? e.company_email);
  if (!mail) return false;
  return site === mail || site.endsWith(`.${mail}`) || mail.endsWith(`.${site}`);
}

export default function AdminEmployers() {
  const [rows, setRows] = useState<Employer[]>([]);
  const [filter, setFilter] = useState<"pending" | "verified" | "rejected" | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async (status: typeof filter) => {
    setErr(null);
    try {
      const res = await fetch(`/api/admin/employers?status=${status}&limit=100`);
      const body = (await res.json().catch(() => null)) as { employers?: Employer[]; error?: string } | null;
      if (!res.ok) {
        setErr(body?.error ?? "Could not load employers.");
        return;
      }
      setRows(Array.isArray(body?.employers) ? body.employers : []);
    } catch {
      setErr("Network error - try again.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load(filter);
  }, [filter]);

  const setPlan = async (employerId: string, plan: string) => {
    if (busy) return;
    setBusy(employerId + plan);
    setErr(null);
    try {
      const res = await fetch("/api/admin/employers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId, action: "set_plan", plan }),
      });
      if (!res.ok) {
        setErr("Plan update failed - try again.");
        return;
      }
      setInfo(`Plan set to ${plan}.`);
    } catch {
      setErr("Network error - try again.");
    } finally {
      setBusy(null);
    }
  };

  const act = async (employerId: string, action: "verify" | "reject") => {    if (busy) return;
    setBusy(employerId + action);
    setErr(null);
    try {
      const res = await fetch("/api/admin/employers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId, action }),
      });
      if (!res.ok) {
        setErr("Action failed - try again.");
        return;
      }
      setRows((rs) =>
        rs.map((r) =>
          r.id === employerId
            ? { ...r, verification_status: action === "verify" ? "verified" : "rejected" }
            : r,
        ),
      );
    } catch {
      setErr("Network error - try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6" role="tablist" aria-label="Verification status filter">
        {(["pending", "verified", "rejected", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={filter === s}
            onClick={() => setFilter(s)}
            className={`btn btn-sm press ${filter === s ? "btn-primary" : "btn-secondary"}`}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {err ? (
        <p className="field-error mb-4" role="alert">
          {err}
        </p>
      ) : null}
      {info ? (
        <p className="field-hint mb-4" role="status">
          {info}
        </p>
      ) : null}
      {!loaded ? (
        <p className="text-body">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty-note">No employers in this bucket.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl bg-surface border border-line p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {r.company_name ?? "Unnamed company"}{" "}
                  {domainMatch(r) ? (
                    <span className="meta-chip" title="Work email domain matches the company website">
                      domain match
                    </span>
                  ) : (
                    <span className="meta-chip" title="Work email domain does not match the company website">
                      no domain match
                    </span>
                  )}
                </p>
                <p className="text-[13px] text-muted mt-1">
                  {[r.account_email ?? r.company_email, r.industry, r.company_size].filter(Boolean).join(" · ")}
                </p>
                <p className="text-[13px] mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {r.website ? (
                    <a
                      href={r.website.startsWith("http") ? r.website : `https://${r.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-muted underline-offset-2"
                    >
                      Website
                    </a>
                  ) : null}
                  {r.linkedin_url ? (
                    <a
                      href={r.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-muted underline-offset-2"
                    >
                      LinkedIn
                    </a>
                  ) : (
                    <span className="text-muted">No LinkedIn provided</span>
                  )}
                </p>
                <p className="font-mono text-[11px] text-muted mt-1">
                  {r.verification_status ?? "pending"}
                  {r.created_at ? ` · since ${String(r.created_at).slice(0, 10)}` : ""}
                </p>
              </div>
              {r.verification_status === "pending" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm press"
                    disabled={busy !== null}
                    onClick={() => void act(r.id, "verify")}
                  >
                    {busy === r.id + "verify" ? "Saving…" : "Verify"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm press"
                    disabled={busy !== null}
                    onClick={() => void act(r.id, "reject")}
                  >
                    {busy === r.id + "reject" ? "Saving…" : "Reject"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <label className="font-mono text-[11px] text-muted" htmlFor={`plan-${r.id}`}>
                    Plan
                  </label>
                  <select
                    id={`plan-${r.id}`}
                    className="input"
                    style={{ maxWidth: 130 }}
                    defaultValue="free"
                    disabled={busy !== null}
                    onChange={(e) => void setPlan(r.id, e.target.value)}
                    aria-label={`Billing plan for ${r.company_name ?? r.id}`}
                  >
                    <option value="free">free · 25/mo</option>
                    <option value="basic">basic · 500/mo</option>
                    <option value="pro">pro · 2000/mo</option>
                  </select>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
