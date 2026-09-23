"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Menu } from "lucide-react";
import type { Bundle } from "@/components/Portfolio";
import DossierCard from "@/components/DossierCard";
import {
  getRawSession,
  serializeRawSession,
  subscribeSession,
  useSessionGuard,
  useLogoutRedirect,
} from "@/lib/session";

type Hr = { name: string; email: string };
type SavedShort = { id: string; name: string };
type PastContact = { candidate_id: string; name: string; channel: string; time: number };

type SideRow = {
  id: string;
  name: string;
  headline: string;
  meta: string;
  photo: string | null;
  score: number | null;
  level: string | null;
};

function levelLabel(level: unknown): string | null {
  if (level === "strong") return "Strong match";
  if (level === "partial") return "Partial match";
  if (level === "weak") return "Emerging match";
  return null;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return (v as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function fmtTime(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" }) +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HireDashboard() {
  // Live guard: logout (any tab) immediately leaves the gated page.
  useSessionGuard("hr");
  // Belt-and-braces: any session END while this page is open bounces to home.
  useLogoutRedirect("/");
  // Deterministic first paint (null on server AND hydration) so SSR never
  // mismatches; the effect below upgrades to the real session without ever
  // flashing the logged-out gate at logged-in users.
  const [hr, setHr] = useState<Hr | null>(null);
  const [ready, setReady] = useState(false);
  // Live identity: re-reads localStorage on login/logout (incl. other tabs).
  const rawHr = useSyncExternalStore(
    subscribeSession,
    () => serializeRawSession(getRawSession()),
    () => "null",
  );
  useEffect(() => {
    try {
      const parsed: Hr | null =
        rawHr === "null"
          ? null
          : (() => {
              const [name = "", email = ""] = rawHr.split("\u0000");
              return { name, email };
            })();
      setHr(parsed && parsed.name && parsed.email ? parsed : null);
    } catch {
      setHr(null);
    }
  }, [rawHr]);
  const [shorts, setShorts] = useState<SavedShort[]>([]);
  const [rows, setRows] = useState<SideRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Record<string, Bundle>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [contacts, setContacts] = useState<PastContact[]>([]);
  const [contactFor, setContactFor] = useState<SideRow | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("platform");
  const [contactState, setContactState] = useState<string | null>(null);
  // Chatbot-style sidebar: drawer on small screens.
  const [sideOpen, setSideOpen] = useState(false);

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem("tammy_hr") ?? "null");
      if (h?.name && h?.email) setHr(h);
      else setHr(null);
    } catch {
      setHr(null);
    }
    const s = loadJSON<SavedShort[]>("tammy_shortlist", []);
    setShorts(s);
    setContacts(loadJSON<PastContact[]>("tammy_contacts", []));
    setReady(true);

    let live = true;
    (async () => {
      if (!s.length) return;
      // Sidebar = shortlisted profiles. ONE batch request replaces the
      // previous 30 sequential full-bundle fetches (~300 DB queries).
      const r = await fetch("/api/candidates/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: s.slice(0, 30).map((x) => x.id) }),
      });
      if (!live) return;
      if (r.ok) {
        const j = (await r.json().catch(() => null)) as { candidates?: { id: string; name: string; headline: string; meta: string; photo: string | null }[] } | null;
        const list: SideRow[] = (j?.candidates ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          headline: c.headline,
          meta: c.meta,
          photo: c.photo,
          score: null,
          level: null,
        }));
        setRows(list);
        if (list[0]) void pick(list[0].id);
        return;
      }
      // Batch failed (e.g. session expired server-side): show the stored
      // names rather than an empty sidebar, but don't hammer the API.
      const list = s.slice(0, 30).map((x) => ({
        id: x.id,
        name: x.name,
        headline: "",
        meta: "",
        photo: null,
        score: null,
        level: null,
      }));
      setRows(list);
      if (list[0]) void pick(list[0].id);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(id: string) {
    setSelected(id);
    if (bundles[id]) return;
    setLoadingProfile(true);
    try {
      const r = await fetch(`/api/candidates?id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const j = (await r.json()) as Bundle;
      if (!j?.candidate?.id) return;
      setBundles((b) => ({ ...b, [id]: j }));
    } finally {
      setLoadingProfile(false);
    }
  }

  async function removeShort(id: string) {
    try {
      const r = await fetch("/api/shortlists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: id }),
      });
      // 404 means already gone server-side — still drop it locally.
      if (!r.ok && r.status !== 404) return;
    } catch {
      return;
    }
    const next = shorts.filter((x) => x.id !== id);
    setShorts(next);
    saveJSON("tammy_shortlist", next);
    setRows((rs) => rs.filter((r) => r.id !== id));
    if (selected === id) setSelected(null);
  }

  async function sendContact() {
    if (!contactFor || !hr) return;
    setContactState("Sending…");
    try {
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: contactFor.id,
          channel,
          message: `[${hr.name} <${hr.email}>] ` + message.trim(),
        }),
      });
      setContactState(r.ok ? "Sent — logged and emailed to the candidate." : "Failed to send. Try again.");
      if (r.ok) {
        const log = loadJSON<PastContact[]>("tammy_contacts", []);
        log.unshift({ candidate_id: contactFor.id, name: contactFor.name, channel, time: Date.now() });
        saveJSON("tammy_contacts", log.slice(0, 100));
        setContacts(log.slice(0, 100));
        setMessage("");
        setTimeout(() => {
          setContactFor(null);
          setContactState(null);
        }, 1200);
      }
    } catch {
      setContactState("Failed to send. Try again.");
    }
  }

  if (!ready) {
    return (
      <div className="employer-dashboard-page hire-shell wide">
        <div className="dash-app" aria-busy="true" aria-label="Loading">
          <aside className="dash-side" aria-hidden="true" />
          <div className="dash-maincol">
            <div className="dash-topbar">
              <p className="dash-stats">Loading workspace…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hr) {
    return (
      <div className="employer-dashboard-page">
        <main className="employer-dashboard-empty">
          <span className="workspace-label">EMPLOYER DESK / 00</span>
          <h1>Make your first shortlist.</h1>
          <p>Join the hiring workspace to search evidence-backed profiles and keep the strongest conversations in one place.</p>
          <Link className="btn-frame solid" href="/hire/login">
            <span className="h tl"></span>
            <span className="h tr"></span>
            <span className="h bl"></span>
            <span className="h br"></span>
            Log in to hire →
          </Link>
        </main>
      </div>
    );
  }

  const selectedRow = selected ? rows.find((r) => r.id === selected) ?? null : null;
  const selectedBundle = selected ? bundles[selected] ?? null : null;

  return (
    <div className="employer-dashboard-page hire-shell wide">
      <div className="dash-app">
        <aside className={"dash-side" + (sideOpen ? " open" : "")} aria-label="Workspace">
          <Link className="btn-frame solid dash-side-cta" href="/hire/search">
            Search talent →
          </Link>
          <p className="dash-side-label">
            {`Shortlist · ${rows.length}`}
          </p>
          {rows.length ? (
            <div className="dash-side-rows">
              {rows.map((r, ri) => (
                <button
                  key={r.id}
                  type="button"
                  className={"dash-side-row" + (selected === r.id ? " active" : "")}
                  onClick={() => { void pick(r.id); setSideOpen(false); }}
                  aria-label={`${r.name} — ${r.headline || r.meta}`}
                  title={`${r.name} — ${r.headline || r.meta}`}
                >
                  {r.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo} alt="" loading="lazy" />
                  ) : (
                    <span className="cand-dot">{r.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="dash-side-meta">
                    <strong><span className="font-mono text-[11px] text-slate-400 mr-1">#{ri + 1}</span>{r.name}</strong>
                    <small>{r.headline || r.meta}</small>
                  </span>
                  {levelLabel(r.level) ? <span className="score">{levelLabel(r.level)}</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="dash-side-empty">No profiles yet — run a search and shortlist the ones you like.</p>
          )}
          <p className="dash-side-label">Outreach · {contacts.length}</p>
          {!contacts.length ? (
            <p className="dash-side-empty">No messages sent yet.</p>
          ) : (
            <div className="dash-side-rows">
              {contacts.slice(0, 10).map((c, i) => (
                <div className="dash-side-row static" key={c.time + i}>
                  <span className="dash-side-meta">
                    <strong>{c.name}</strong>
                    <small>{c.channel} · {fmtTime(c.time)}</small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
        {sideOpen ? (
          <button aria-hidden="true" tabIndex={-1} className="dash-veil" onClick={() => setSideOpen(false)} />
        ) : null}
        <div className="dash-maincol">
          <div className="dash-topbar">
            <button type="button" className="dash-burger" aria-label="Open workspace menu" onClick={() => setSideOpen(true)}>
              <Menu />
            </button>
            <p className="dash-stats">
              {shorts.length} shortlisted · {contacts.length} contacted
            </p>
          </div>
          <div className="dash-detail">
            {selectedRow ? (
              <>
              {loadingProfile && !selectedBundle ? <p className="loading">Loading profile…</p> : null}
              {selectedBundle && selectedRow ? (
                <DossierCard
                  bundle={selectedBundle}
                  match={{ overall_score: selectedRow.score, match_level: selectedRow.level }}
                  shortlisted={shorts.some((x) => x.id === (selectedRow?.id ?? ""))}
                  dossierHref={`/talent/${selectedRow.id}`}
                  onContact={() => {
                    setContactFor(selectedRow);
                    setContactState(null);
                  }}
                  onToggleShortlist={() => void removeShort(selectedRow.id)}
                />
              ) : null}
              </>
              ) : (
                <div className="center" style={{ padding: "48px 0" }}>
                  <p style={{ marginBottom: 16 }}>
                    Select a profile from the shortlist — or run a fresh search.
                  </p>
                  <Link className="btn-frame solid" href="/hire/search">
                    Search talent →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

      {contactFor ? (
        <div
          className="modal-veil"
          role="presentation"
          onKeyDown={(e) => {
            if (e.key === "Escape") setContactFor(null);
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onClick={() => setContactFor(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Message ${contactFor.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Message {contactFor.name.split(" ")[0]}</h3>
            <p>
              As {hr.name} ({hr.email}). Logged in the open-contact record and
              emailed to the candidate.
            </p>
            <div className="field">
              <label htmlFor="dash-channel">Channel</label>
              <select id="dash-channel" className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="platform">Platform</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Message</label>
              <textarea
                className="textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi — we're hiring a … and your work on … stood out. Open to a 20-min chat this week?"
                autoFocus
              />
            </div>
            {contactState ? <p className="oknote">{contactState}</p> : null}
            <div className="modal-actions">
              <button className="btn-plain" type="button" onClick={() => setContactFor(null)}>
                Cancel
              </button>
              <button className="btn-frame solid" type="button" onClick={sendContact} disabled={!message.trim()}>
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                Send →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
