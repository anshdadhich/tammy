"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Hr = { name: string; email: string };
type SavedShort = { id: string; name: string };
type PastSearch = { time: number; title: string; count: number; job: Record<string, any> };
type PastContact = { candidate_id: string; name: string; channel: string; time: number };

type Mini = {
  id: string;
  name: string;
  headline: string;
  meta: string;
  photo: string | null;
};

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return (v as T) ?? fallback;
  } catch {
    return fallback;
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
  const [minis, setMinis] = useState<Record<string, Mini>>({});
  const [searches, setSearches] = useState<PastSearch[]>([]);
  const [contacts, setContacts] = useState<PastContact[]>([]);

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
    Promise.all(
      s.slice(0, 30).map((x) =>
        fetch(`/api/candidates?id=${encodeURIComponent(x.id)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (!j?.candidate) return null;
            const c = j.candidate as Record<string, any>;
            return {
              id: x.id,
              name: String(c.full_name ?? x.name),
              headline: String(c.headline ?? c.current_position ?? ""),
              meta: [c.domain, c.total_experience_years ? `${c.total_experience_years}y` : null, c.location_city]
                .filter(Boolean)
                .join(" · "),
              photo: typeof c.photo_url === "string" && /^https?:\/\//i.test(c.photo_url) ? c.photo_url : null,
            } as Mini;
          })
          .catch(() => null),
      ),
    ).then((rows) => {
      if (!live) return;
      const map: Record<string, Mini> = {};
      for (const r of rows) if (r) map[r.id] = r;
      setMinis(map);
    });
    return () => {
      live = false;
    };
  }, []);

  function open(id: string) {
    try {
      sessionStorage.setItem("tammy_open", id);
    } catch {
      /* ignore */
    }
    router.push("/hire");
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
    try {
      localStorage.setItem("tammy_shortlist", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function rerun(job: Record<string, any>) {
    try {
      sessionStorage.setItem("tammy_rerun", JSON.stringify({ job }));
    } catch {
      /* ignore */
    }
    router.push("/hire");
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

      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 4 }}>
        Your desk, {hr.name.split(" ")[0]}.
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 20 }}>
        Shortlists, past searches and outreach — everything you did, one place.
      </p>

      <div className="dashstats">
        <div className="form-card" style={{ marginBottom: 0 }}>
          <p className="section-label">Shortlisted</p>
          <h3 style={{ fontSize: 26 }}>{shorts.length}</h3>
        </div>
        <div className="form-card" style={{ marginBottom: 0 }}>
          <p className="section-label">Searches run</p>
          <h3 style={{ fontSize: 26 }}>{searches.length}</h3>
        </div>
        <div className="form-card" style={{ marginBottom: 0 }}>
          <p className="section-label">Candidates contacted</p>
          <h3 style={{ fontSize: 26 }}>{contacts.length}</h3>
        </div>
      </div>

      <div className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-title">Shortlist</span>
          <span className="pf-sec-sub">{shorts.length} saved</span>
        </div>
        {!shorts.length ? (
          <p className="pf-bio">
            Nothing saved yet — search talent and hit ☆ Shortlist on any profile.
          </p>
        ) : (
          <div className="exp-list">
            {shorts.map((s) => {
              const m = minis[s.id];
              return (
                <div className="exp-card" key={s.id}>
                  <div className="exp-left">
                    {m?.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photo} alt={m.name} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div className="exp-icon">{(m?.name ?? s.name).slice(0, 1).toUpperCase()}</div>
                    )}
                    <div className="exp-info">
                      <h3>{m?.name ?? s.name}</h3>
                      <p>{m ? `${m.headline} · ${m.meta}` : "Loading…"}</p>
                    </div>
                  </div>
                  <div className="exp-meta">
                    <button className="btn-frame" type="button" onClick={() => open(s.id)} style={{ marginRight: 8 }}>
                      <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                      Open
                    </button>
                    <button className="btn-plain" type="button" onClick={() => void removeShort(s.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pf-sec">
        <div className="pf-sec-head">
          <span className="pf-sec-title">Recent searches</span>
          <span className="pf-sec-sub">re-run in one click</span>
        </div>
        {!searches.length ? (
          <p className="pf-bio">No searches yet.</p>
        ) : (
          <div className="exp-list">
            {searches.map((s, i) => (
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
            {contacts.slice(0, 20).map((c, i) => (
              <div className="exp-card" key={c.time + i}>
                <div className="exp-left">
                  <div className="exp-icon">✉</div>
                  <div className="exp-info">
                    <h3>{c.name}</h3>
                    <p>{c.channel} · {fmtTime(c.time)}</p>
                  </div>
                </div>
                <div className="exp-meta">
                  <button className="btn-frame" type="button" onClick={() => open(c.candidate_id)}>
                    <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
