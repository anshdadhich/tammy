"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Portfolio, { type Bundle } from "@/components/Portfolio";

type Hr = { name: string; email: string };
type SavedShort = { id: string; name: string };
type PastSearch = { time: number; title: string; count: number; job: Record<string, any> };
type PastContact = { candidate_id: string; name: string; channel: string; time: number };

type SideRow = {
  id: string;
  name: string;
  headline: string;
  meta: string;
  photo: string | null;
  score: number | null;
};

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
  const router = useRouter();
  const [hr, setHr] = useState<Hr | null>(null);
  const [shorts, setShorts] = useState<SavedShort[]>([]);
  const [rows, setRows] = useState<SideRow[]>([]);
  const [source, setSource] = useState<"shortlist" | "search">("shortlist");
  const [selected, setSelected] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Record<string, Bundle>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [searches, setSearches] = useState<PastSearch[]>([]);
  const [contacts, setContacts] = useState<PastContact[]>([]);
  const [contactFor, setContactFor] = useState<SideRow | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("platform");
  const [contactState, setContactState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem("tammy_hr") ?? "null");
      if (h?.name && h?.email) setHr(h);
    } catch {
      /* ignore */
    }
    const s = loadJSON<SavedShort[]>("tammy_shortlist", []);
    setShorts(s);
    setSearches(loadJSON<PastSearch[]>("tammy_searches", []));
    setContacts(loadJSON<PastContact[]>("tammy_contacts", []));

    let live = true;
    (async () => {
      if (s.length) {
        // Sidebar = shortlisted profiles (resolved to live data).
        const minis = await Promise.all(
          s.slice(0, 30).map((x) =>
            fetch(`/api/candidates?id=${encodeURIComponent(x.id)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((j) => {
                if (!j?.candidate?.id) return null;
                const c = j.candidate as Record<string, any>;
                return {
                  id: x.id,
                  name: String(c.full_name ?? x.name),
                  headline: String(c.headline ?? c.current_position ?? ""),
                  meta: [c.domain, c.total_experience_years ? `${c.total_experience_years}y` : null, c.location_city]
                    .filter(Boolean)
                    .join(" · "),
                  photo:
                    typeof c.photo_url === "string" && /^https?:\/\//i.test(c.photo_url) ? c.photo_url : null,
                  score: null,
                } as SideRow;
              })
              .catch(() => null),
          ),
        );
        if (!live) return;
        const list = minis.filter((r): r is SideRow => !!r);
        setRows(list);
        setSource("shortlist");
        if (list[0]) void pick(list[0].id);
        return;
      }
      // No shortlist yet: sidebar = latest search results.
      try {
        const last = JSON.parse(sessionStorage.getItem("tammy_last_search") ?? "null");
        const found = Array.isArray(last?.results)
          ? (last.results as Record<string, any>[]).filter((r) => r?.id && r?.full_name)
          : [];
        if (!live) return;
        const list: SideRow[] = found.slice(0, 20).map((r) => ({
          id: String(r.id),
          name: String(r.full_name),
          headline: String(r.headline ?? ""),
          meta: [r.domain, r.total_experience_years ? `${r.total_experience_years}y` : null, r.location_city]
            .filter(Boolean)
            .join(" · "),
          photo: typeof r.photo_url === "string" && /^https?:\/\//i.test(r.photo_url) ? r.photo_url : null,
          score: typeof r.overall_score === "number" ? Math.round(r.overall_score) : null,
        }));
        setRows(list);
        setSource("search");
        if (list[0]) void pick(list[0].id);
      } catch {
        /* ignore */
      }
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
      await fetch("/api/shortlists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: id }),
      });
    } catch {
      /* best-effort */
    }
    const next = shorts.filter((x) => x.id !== id);
    setShorts(next);
    saveJSON("tammy_shortlist", next);
    setRows((rs) => rs.filter((r) => r.id !== id));
    if (selected === id) setSelected(null);
  }

  function openInSearch(id: string) {
    try {
      sessionStorage.setItem("tammy_open", id);
    } catch {
      /* ignore */
    }
    router.push("/hire");
  }

  function rerun(job: Record<string, any>) {
    try {
      sessionStorage.setItem("tammy_rerun", JSON.stringify({ job }));
    } catch {
      /* ignore */
    }
    router.push("/hire");
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

  if (!hr) {
    return (
      <div className="wrap center" style={{ maxWidth: 480 }}>
        <p style={{ marginBottom: 16 }}>Join as HR first — it takes ten seconds.</p>
        <Link className="btn-frame btn-green" href="/hire">
          <span className="h tl"></span>
          <span className="h tr"></span>
          <span className="h bl"></span>
          <span className="h br"></span>
          Go to hiring →
        </Link>
      </div>
    );
  }

  const selectedRow = selected ? rows.find((r) => r.id === selected) ?? null : null;
  const selectedBundle = selected ? bundles[selected] ?? null : null;

  return (
    <div className="hire-shell wide">
      <div className="topbar">
        <Link className="brand" href="/">
          Tammy <small>· Beta</small>
        </Link>
        <span className="hrtaps">
          <Link href="/hire">Search</Link>
          <span className="on">Dashboard</span>
        </span>
        <span className="who">
          {hr.name} · {hr.email}
        </span>
      </div>

      <div className="dash-hero">
        <div>
          <h1>Your desk, {hr.name.split(" ")[0]}.</h1>
          <p>Profiles that mattered, one click from a conversation.</p>
        </div>
        <div className="dashstats">
          <div className="stat">
            <p>Shortlisted</p>
            <h3>{shorts.length}</h3>
          </div>
          <div className="stat">
            <p>Searches run</p>
            <h3>{searches.length}</h3>
          </div>
          <div className="stat">
            <p>Contacted</p>
            <h3>{contacts.length}</h3>
          </div>
        </div>
      </div>

      {!rows.length ? (
        <div className="center" style={{ padding: "40px 0" }}>
          <p style={{ marginBottom: 16 }}>
            No profiles here yet — run a search and shortlist the ones you like.
          </p>
          <Link className="btn-frame solid" href="/hire">
            <span className="h tl"></span>
            <span className="h tr"></span>
            <span className="h bl"></span>
            <span className="h br"></span>
            Search talent →
          </Link>
        </div>
      ) : (
        <div>
          <p className="results-head" style={{ margin: "0 0 12px" }}>
            <strong>
              {rows.length} profile{rows.length === 1 ? "" : "s"}
            </strong>{" "}
            · from your {source === "shortlist" ? "shortlist" : "latest search"}
          </p>
          <div className="two-pane">
            <div className="side-list">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={"cand-row" + (selected === r.id ? " active" : "")}
                  onClick={() => void pick(r.id)}
                >
                  {r.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo} alt={r.name} />
                  ) : (
                    <span className="cand-dot">{r.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="cand-main">
                    <h4>{r.name}</h4>
                    <p>{r.headline}</p>
                    <span className="cand-meta">{r.meta}</span>
                  </span>
                  {r.score !== null ? <span className="score">★ {r.score}</span> : null}
                </button>
              ))}
            </div>
            <div className="main-pane" key={selected ?? "none"}>
              <div className="hr-bar">
                <span className="who">
                  {selectedRow ? `${selectedRow.name} · messages are logged` : "Pick a profile"}
                </span>
                {selectedRow ? (
                  <span className="rowline">
                    <button
                      className="btn-frame btn-green"
                      type="button"
                      onClick={() => {
                        setContactFor(selectedRow);
                        setContactState(null);
                      }}
                    >
                      <span className="h tl"></span>
                      <span className="h tr"></span>
                      <span className="h bl"></span>
                      <span className="h br"></span>
                      Contact ↗
                    </button>
                    {source === "shortlist" ? (
                      <button className="btn-plain" type="button" onClick={() => void removeShort(selectedRow.id)}>
                        Remove
                      </button>
                    ) : (
                      <button className="btn-plain" type="button" onClick={() => openInSearch(selectedRow.id)}>
                        Open in search
                      </button>
                    )}
                  </span>
                ) : null}
              </div>
              {loadingProfile && !selectedBundle ? <p className="loading">Loading profile…</p> : null}
              {selectedBundle ? <Portfolio bundle={selectedBundle} mode="hr" calm /> : null}
            </div>
          </div>
        </div>
      )}

      <div className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-title">Recent searches</span>
          <span className="pf-sec-sub">re-run in one click</span>
        </div>
        {!searches.length ? (
          <p className="pf-bio">No searches yet.</p>
        ) : (
          <div className="exp-list">
            {searches.slice(0, 5).map((s, i) => (
              <div className="exp-card" key={s.time + i}>
                <div className="exp-left">
                  <div className="exp-icon">⌕</div>
                  <div className="exp-info">
                    <h3>{s.title}</h3>
                    <p>{s.count} matches · {fmtTime(s.time)}</p>
                  </div>
                </div>
                <div className="exp-meta">
                  <button className="btn-frame" type="button" onClick={() => rerun(s.job)}>
                    <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                    Re-run
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-title">Outreach log</span>
          <span className="pf-sec-sub">{contacts.length} sent</span>
        </div>
        {!contacts.length ? (
          <p className="pf-bio">No messages sent yet.</p>
        ) : (
          <div className="exp-list">
            {contacts.slice(0, 10).map((c, i) => (
              <div className="exp-card" key={c.time + i}>
                <div className="exp-left">
                  <div className="exp-icon">✉</div>
                  <div className="exp-info">
                    <h3>{c.name}</h3>
                    <p>{c.channel} · {fmtTime(c.time)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {contactFor ? (
        <div className="modal-veil" onClick={() => setContactFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Message {contactFor.name.split(" ")[0]}</h3>
            <p>
              As {hr.name} ({hr.email}). Logged in the open-contact record and
              emailed to the candidate.
            </p>
            <div className="field">
              <label>Channel</label>
              <select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
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
