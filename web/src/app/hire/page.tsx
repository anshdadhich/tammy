"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import Portfolio, { type Bundle } from "@/components/Portfolio";
import SkillPicker from "@/components/SkillPicker";

type Result = Record<string, any>;

type Hr = { name: string; email: string };

type SavedShort = { id: string; name: string };
type PastSearch = { time: number; title: string; count: number; job: Record<string, any> };
type PastContact = { candidate_id: string; name: string; channel: string; time: number };

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

function loadHr(): Hr | null {
  try {
    const h = JSON.parse(localStorage.getItem("tammy_hr") ?? "null");
    if (h?.name && h?.email) return h as Hr;
  } catch {
    /* ignore */
  }
  return null;
}

export default function Hire() {
  const [hr, setHr] = useState<Hr | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [desc, setDesc] = useState("");
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("");
  const [seniority, setSeniority] = useState("mid");
  const [must, setMust] = useState("");
  const [nice, setNice] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("remote");
  const [minExp, setMinExp] = useState(1);
  const [maxExp, setMaxExp] = useState(5);
  const [salMin, setSalMin] = useState(0);
  const [salMax, setSalMax] = useState(0);
  const [empType, setEmpType] = useState("full-time");
  const [currency, setCurrency] = useState("INR");
  const [deep, setDeep] = useState(false);
  const [relocation, setRelocation] = useState(false);

  const SUGGESTIONS: { label: string; desc: string; title: string; domain: string; must: string; seniority: string; mode: string }[] = [
    {
      label: "Designer · fintech · remote",
      desc: "Senior product designer for a fintech dashboard — owns flows end-to-end, runs usability tests, ships weekly with React engineers.",
      title: "Product Designer",
      domain: "Design",
      must: "Figma, React, Design Systems",
      seniority: "senior",
      mode: "remote",
    },
    {
      label: "Backend · Node/Postgres",
      desc: "Backend developer for logistics APIs — owns auth, schema design and deployment, realtime tracking with WebSockets and Redis.",
      title: "Backend Developer",
      domain: "Software Development",
      must: "Node.js, PostgreSQL, Redis",
      seniority: "mid",
      mode: "remote",
    },
    {
      label: "Design systems lead",
      desc: "Design systems lead to own tokens, component architecture and workflow surfaces across a web platform.",
      title: "Design Systems Lead",
      domain: "Design",
      must: "Figma, Design Systems",
      seniority: "lead",
      mode: "hybrid",
    },
  ];

  function useSuggestion(s: (typeof SUGGESTIONS)[number]) {
    setDesc(s.desc);
    setTitle(s.title);
    setDomain(s.domain);
    setMust(s.must);
    setSeniority(s.seniority);
    setMode(s.mode);
    setError(null);
  }

  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Record<string, Bundle>>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [contactFor, setContactFor] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("platform");
  const [contactState, setContactState] = useState<string | null>(null);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const cache = useRef<Record<string, Bundle>>({});
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHr(loadHr());
    try {
      const rerun = JSON.parse(sessionStorage.getItem("tammy_rerun") ?? "null");
      if (rerun?.job) {
        sessionStorage.removeItem("tammy_rerun");
        applyJob(rerun.job);
        void runSearch(rerun.job);
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      const last = JSON.parse(sessionStorage.getItem("tammy_last_search") ?? "null");
      const rows = Array.isArray(last?.results)
        ? (last.results as Result[]).filter((r) => r?.id && r?.full_name)
        : [];
      if (rows.length) {
        setResults(rows);
        setSearched(true);
        if (rows[0]?.id) void select(String(rows[0].id));
      } else if (last?.results?.length) {
        // Corrupt/stale cache (e.g. deleted profiles) — drop it, search again.
        try {
          sessionStorage.removeItem("tammy_last_search");
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const open = sessionStorage.getItem("tammy_open");
      if (open) {
        sessionStorage.removeItem("tammy_open");
        void openSingle(open);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function joinHr(e: React.FormEvent) {
    e.preventDefault();
    const h = { name: name.trim(), email: email.trim() };
    if (!h.name || !h.email) return;
    try {
      localStorage.setItem("tammy_hr", JSON.stringify(h));
    } catch {
      /* ignore */
    }
    setHr(h);
  }

  const csv = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);

  function buildJob(description: string) {
    return {
      title: title.trim(),
      domain: domain.trim(),
      seniority,
      must_have: csv(must),
      nice_to_have: csv(nice),
      min_exp: Number(minExp) || 0,
      max_exp: Number(maxExp) || 0,
      salary_min: Number(salMin) || 0,
      ...(Number(salMax) > 0 ? { salary_max: Number(salMax) } : {}),
      currency: (currency.trim() || "INR").toUpperCase().slice(0, 3),
      location: location.trim(),
      remote_policy: mode,
      relocation_allowed: relocation,
      employment_type: empType,
      description,
    };
  }

  function applyJob(job: Record<string, any>) {
    if (typeof job.description === "string") setDesc(job.description);
    if (typeof job.title === "string") setTitle(job.title);
    if (typeof job.domain === "string") setDomain(job.domain);
    if (typeof job.seniority === "string") setSeniority(job.seniority);
    if (Array.isArray(job.must_have)) setMust(job.must_have.join(", "));
    if (Array.isArray(job.nice_to_have)) setNice(job.nice_to_have.join(", "));
    if (typeof job.location === "string") setLocation(job.location);
    if (typeof job.remote_policy === "string") setMode(job.remote_policy);
    if (typeof job.employment_type === "string") setEmpType(job.employment_type);
    if (typeof job.currency === "string") setCurrency(job.currency);
    if (typeof job.relocation_allowed === "boolean") setRelocation(job.relocation_allowed);
    if (typeof job.min_exp === "number") setMinExp(job.min_exp);
    if (typeof job.max_exp === "number") setMaxExp(job.max_exp);
    if (typeof job.salary_min === "number") setSalMin(job.salary_min);
    if (typeof job.salary_max === "number") setSalMax(job.salary_max);
  }

  async function runSearch(job: Record<string, any>, isDeep = false) {
    setBusy(true);
    setSearching(true);
    setError(null);
    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, limit: isDeep ? 10 : 20, deep: isDeep }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const errs = j?.errors?.fieldErrors;
        const first = errs
          ? Object.entries(errs).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).slice(0, 3).join(" · ")
          : (j?.error ?? "Search failed.");
        setError(first);
        return;
      }
      const rows: Result[] = j.results ?? [];
      setResults(rows);
      setSearched(true);
      try {
        sessionStorage.setItem("tammy_last_search", JSON.stringify({ results: rows }));
        const past = loadJSON<PastSearch[]>("tammy_searches", []);
        past.unshift({
          time: Date.now(),
          title: String(job.title ?? "Untitled role"),
          count: rows.length,
          job,
        });
        saveJSON("tammy_searches", past.slice(0, 10));
      } catch {
        /* ignore */
      }
      if (rows.length && rows[0]?.id) {
        void select(String(rows[0].id));
        requestAnimationFrame(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        setSelected(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setSearching(false);
    }
  }

  async function openSingle(id: string) {
    try {
      const r = await fetch(`/api/candidates?id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const j = (await r.json()) as Bundle;
      const c = (j.candidate ?? {}) as Record<string, any>;
      if (!c?.id || !c?.full_name) return;
      cache.current[id] = j;
      setBundles((b) => ({ ...b, [id]: j }));
      setResults([
        {
          id,
          full_name: c.full_name,
          headline: c.headline,
          domain: c.domain,
          total_experience_years: c.total_experience_years,
          location_city: c.location_city,
          photo_url: c.photo_url,
          overall_score: null,
        },
      ]);
      setSearched(true);
      setSelected(id);
    } catch {
      /* ignore */
    }
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const description = desc.trim();
    if (description.length < 20) {
      setError("Describe the role in a sentence or two (20+ characters) so matching has something to work with.");
      return;
    }
    if (!title.trim() || !domain.trim()) {
      setError("Role title and domain are required.");
      return;
    }
    if (!csv(must).length) {
      setError("Add at least one must-have skill (comma separated).");
      return;
    }
    await runSearch(buildJob(description), deep);
  }

  async function select(id: string) {
    setSelected(id);
    setProfileError(null);
    if (cache.current[id]) {
      setBundles((b) => ({ ...b, [id]: cache.current[id] }));
      return;
    }
    setLoadingProfile(true);
    try {
      const r = await fetch(`/api/candidates?id=${encodeURIComponent(id)}`);
      if (!r.ok) {
        setProfileError(
          r.status === 404
            ? "This profile was deleted or hidden. Pick another match."
            : "Couldn't load this profile. Check your connection and retry.",
        );
        return;
      }
      const j = (await r.json()) as Bundle;
      if (!j?.candidate?.id) {
        setProfileError("This profile came back empty. Pick another match.");
        return;
      }
      cache.current[id] = j;
      setBundles((b) => ({ ...b, [id]: j }));
    } catch {
      setProfileError("Couldn't load this profile. Check your connection and retry.");
    } finally {
      setLoadingProfile(false);
    }
  }

  async function sendContact() {
    if (!contactFor) return;
    setContactState("Sending…");
    try {
      const sig = hr ? `[${hr.name} <${hr.email}>] ` : "";
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: contactFor.id,
          channel,
          message: sig + message.trim(),
        }),
      });
      setContactState(r.ok ? "Sent — logged and emailed to the candidate." : "Failed to send. Try again.");
      if (r.ok) {
        const log = loadJSON<PastContact[]>("tammy_contacts", []);
        log.unshift({
          candidate_id: String(contactFor.id),
          name: String(contactFor.full_name ?? "Candidate"),
          channel,
          time: Date.now(),
        });
        saveJSON("tammy_contacts", log.slice(0, 100));
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

  async function shortlist(cand: Result) {
    try {
      const r = await fetch("/api/shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: cand.id,
          notes: hr ? `Saved by ${hr.name} <${hr.email}>` : "Saved from search",
        }),
      });
      if (!r.ok) return;
      setShortlisted((s) => new Set(s).add(String(cand.id)));
      const saved = loadJSON<SavedShort[]>("tammy_shortlist", []);
      if (!saved.some((x) => x.id === String(cand.id))) {
        saved.unshift({ id: String(cand.id), name: String(cand.full_name ?? "Candidate") });
        saveJSON("tammy_shortlist", saved.slice(0, 100));
      }
    } catch {
      /* ignore */
    }
  }

  function rowCard(c: Result, i = 0) {
    if (!c?.id || !c?.full_name) return null;
    const active = selected === String(c.id);
    const dot = String(c.full_name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();
    return (
      <motion.button
        key={String(c.id)}
        className={"cand-row" + (active ? " active" : "")}
        onClick={() => void select(String(c.id))}
        type="button"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: Math.min(i, 8) * 0.04 }}
      >
        {c.photo_url && /^https?:\/\//i.test(c.photo_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo_url} alt={c.full_name} />
        ) : (
          <span className="cand-dot">{dot || "?"}</span>
        )}
        <span className="cand-main">
          <h4>{c.full_name}</h4>
          <p>{c.headline}</p>
          <span className="cand-meta">
            {[c.domain, c.total_experience_years ? `${c.total_experience_years}y` : null, c.location_city]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {typeof c.overall_score === "number" ? (
          <span className="score">★ {Math.round(c.overall_score)}</span>
        ) : null}
      </motion.button>
    );
  }

  if (!hr) {
    return (
      <div className="wrap" style={{ maxWidth: 520 }}>
        <div className="topbar">
          <Link className="brand" href="/">
            Tammy <small>· Beta</small>
          </Link>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>
          Hire with proof.
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
          Tell us who you are — no passwords. Your name travels with every
          message you send a candidate.
        </p>
        <form onSubmit={joinHr} className="form-card">
          <div className="field">
            <label>Your name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Priya Sharma" />
          </div>
          <div className="field">
            <label>Work email *</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="priya@company.com" />
          </div>
          <div className="rowline" style={{ flexWrap: "wrap" }}>
          <button className="btn-frame solid" type="submit">
            <span className="h tl"></span>
            <span className="h tr"></span>
            <span className="h bl"></span>
            <span className="h br"></span>
            Start hiring →
          </button>
          <button
            className="btn-frame"
            type="button"
            onClick={() => {
              const h = { name: "Test Recruiter", email: "recruiter@test.local" };
              try {
                localStorage.setItem("tammy_hr", JSON.stringify(h));
              } catch {
                /* ignore */
              }
              setHr(h);
            }}
          >
            <span className="h tl"></span>
            <span className="h tr"></span>
            <span className="h bl"></span>
            <span className="h br"></span>
            ⚡ Test login (skip form)
          </button>
          </div>
        </form>
      </div>
    );
  }

  const selectedBundle = selected ? bundles[selected] : null;
  const selectedRow = selected ? results.find((r) => String(r.id) === selected) : null;

  return (
    <div className={"hire-shell" + (searched || searching ? " wide" : "")}>
      <div className="topbar">
        <Link className="brand" href="/">
          Tammy <small>· Beta</small>
        </Link>
        <span className="hrtaps">
          <span className="on">Search</span>
          <Link href="/hire/dash">Dashboard</Link>
        </span>
        <span className="who">
          {hr.name} · {hr.email} ·{" "}
          <button
            className="btn-plain"
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem("tammy_hr");
              } catch {
                /* ignore */
              }
              setHr(null);
            }}
          >
            switch
          </button>
        </span>
      </div>

      {!searched && !searching ? (
        <div className="chat-hero">
          <h1>Who do you need?</h1>
          <p>Describe the role like you&apos;d say it. Tune the filters, press Enter.</p>
          <div className="suggest-row">
            {SUGGESTIONS.map((s) => (
              <button key={s.label} type="button" className="chipbtn" onClick={() => useSuggestion(s)}>
                ✦ {s.label}
              </button>
            ))}
          </div>
          <form onSubmit={search}>
            <div className="chat-box">
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Senior product designer for a fintech dashboard — owns flows end-to-end, works with React engineers, ships weekly…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void search();
                }}
              />
              <div className="chat-actions">
                <span className="chat-count">{desc.trim().length}/20+ characters needed</span>
                <span className="rowline">
                  <button
                    type="button"
                    className="switchrow"
                    style={{ width: "auto", gap: 8 }}
                    onClick={() => setDeep(!deep)}
                    title="Deep read: the judge reads top profiles fully. Slower, sharper."
                  >
                    <span style={{ fontSize: 12.5 }}>Deep read</span>
                    <span className={"switch" + (deep ? " on" : "")}>
                      <span className="thumb" />
                    </span>
                  </button>
                  <button className="btn-frame solid" type="submit" disabled={busy}>
                    <span className="h tl"></span>
                    <span className="h tr"></span>
                    <span className="h bl"></span>
                    <span className="h br"></span>
                    {busy ? "Searching…" : "Search →"}
                  </button>
                </span>
              </div>
            </div>
            <div className="filters">
              <div className="field"><label>Role title *</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product Designer" /></div>
              <div className="field"><label>Domain *</label><input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Design" /></div>
              <div className="field"><label>Location</label><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bengaluru" /></div>
              <div className="field"><label>Employment</label><select className="select" value={empType} onChange={(e) => setEmpType(e.target.value)}><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="freelance">Freelance</option></select></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Seniority</label>
                <div className="seg">
                  {(["intern", "junior", "mid", "senior", "lead"] as const).map((s) => (
                    <button key={s} type="button" className={seniority === s ? "on" : ""} onClick={() => setSeniority(s)}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Work mode</label>
                <div className="seg">
                  {(["remote", "hybrid", "onsite"] as const).map((m) => (
                    <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                      {m[0].toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Must-have skills * — recognized names, so ranking stays clean</label>
                <SkillPicker value={csv(must)} onChange={(a) => setMust(a.join(", "))} placeholder="Search must-have skills…" />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Nice-to-have</label>
                <SkillPicker value={csv(nice)} onChange={(a) => setNice(a.join(", "))} placeholder="Search nice-to-have skills…" />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="f-label"><span>Experience range</span><output>{minExp}–{maxExp} yrs</output></div>
                <div className="dual"><span>Min</span><input type="range" className="slider" min={0} max={Math.max(30, minExp, maxExp)} step={1} value={Math.min(minExp, Math.max(30, minExp, maxExp))} onChange={(e) => setMinExp(Math.min(Number(e.target.value), maxExp))} aria-label="Minimum experience" /></div>
                <div className="dual"><span>Max</span><input type="range" className="slider" min={0} max={Math.max(30, minExp, maxExp)} step={1} value={Math.min(maxExp, Math.max(30, minExp, maxExp))} onChange={(e) => setMaxExp(Math.max(Number(e.target.value), minExp))} aria-label="Maximum experience" /></div>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="f-label">
                  <span>Salary range {salMax === 0 ? "(no max)" : ""}</span>
                  <output>{Number(salMin).toLocaleString()} – {salMax === 0 ? "∞" : Number(salMax).toLocaleString()} {currency}</output>
                </div>
                <div className="dual"><span>Min</span><input type="range" className="slider" min={0} max={Math.max(1000000, salMin, salMax)} step={25000} value={Math.min(salMin, Math.max(1000000, salMin, salMax))} onChange={(e) => { const v = Number(e.target.value); setSalMin(v); if (salMax !== 0 && salMax < v) setSalMax(v); }} aria-label="Minimum salary" /></div>
                <div className="dual"><span>Max</span><input type="range" className="slider" min={0} max={Math.max(1000000, salMin, salMax)} step={25000} value={Math.min(salMax, Math.max(1000000, salMin, salMax))} onChange={(e) => { const v = Number(e.target.value); setSalMax(salMax !== 0 && v < salMin ? salMin : v); }} aria-label="Maximum salary, 0 means any" /></div>
                <div className="rowline" style={{ marginTop: 8 }}>
                  <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ maxWidth: 120 }}>
                    <option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AED">AED</option>
                  </select>
                  <label className="checkrow">
                    <input type="checkbox" checked={relocation} onChange={(e) => setRelocation(e.target.checked)} />
                    Open to relocation
                  </label>
                </div>
              </div>
            </div>
          </form>
          {error ? <p className="err" style={{ marginTop: 12 }}>{error}</p> : null}
        </div>
      ) : searching ? (
        <div className="searching">
          <motion.div
            className="search-pulse"
            animate={{ opacity: [0.35, 1, 0.35], scale: [0.97, 1, 0.97] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            <span className="score" style={{ fontSize: 14 }}>◌ Searching</span>
          </motion.div>
          <h2>Reading your brief…</h2>
          <p>Embedding the role, matching evidence across profiles, ranking the best fits.</p>
          <ul>
            <li>Parsing must-haves{csv(must).length ? `: ${csv(must).slice(0, 4).join(", ")}` : ""}</li>
            <li>Filtering {location.trim() || "anywhere"} · {mode} · {minExp}–{maxExp} yrs</li>
          </ul>
        </div>
      ) : results.length ? (
        <div ref={resultsRef} style={{ scrollMarginTop: 12 }}>
          <div className="rowline" style={{ marginBottom: 12, justifyContent: "space-between" }}>
            <span className="results-head" style={{ margin: 0 }}>
              <strong>
                {results.length} match{results.length === 1 ? "" : "es"}
              </strong>
              {" "}— top fit opened for you
            </span>
            <button
              className="btn-frame"
              type="button"
              onClick={() => {
                setSearched(false);
                setSelected(null);
              }}
            >
              <span className="h tl"></span>
              <span className="h tr"></span>
              <span className="h bl"></span>
              <span className="h br"></span>
              New search
            </button>
          </div>
          <div className="two-pane">
            <div className="side-list">{results.map((c, i) => rowCard(c, i))}</div>
            <motion.div
              className="main-pane"
              key={selected}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="hr-bar">
                <span className="who">
                  Viewing as {hr.name} · messages are logged
                </span>
                {selectedRow ? (
                  <span className="score">
                    {typeof selectedRow.overall_score === "number"
                      ? `★ ${Math.round(selectedRow.overall_score)}`
                      : selectedRow.match_level ?? "match"}
                  </span>
                ) : null}
              </div>
              {loadingProfile && !selectedBundle ? (
                <p className="loading">Loading profile…</p>
              ) : null}
              {profileError && !selectedBundle ? (
                <div className="center" style={{ padding: "60px 24px" }}>
                  <p style={{ marginBottom: 16 }}>{profileError}</p>
                  <div className="rowline" style={{ justifyContent: "center" }}>
                    {selected ? (
                      <button className="btn-frame btn-green" type="button" onClick={() => void select(selected)}>
                        <span className="h tl"></span>
                        <span className="h tr"></span>
                        <span className="h bl"></span>
                        <span className="h br"></span>
                        Retry →
                      </button>
                    ) : null}
                    <button
                      className="btn-frame"
                      type="button"
                      onClick={() => {
                        setSearched(false);
                        setSelected(null);
                        setProfileError(null);
                      }}
                    >
                      <span className="h tl"></span>
                      <span className="h tr"></span>
                      <span className="h bl"></span>
                      <span className="h br"></span>
                      New search
                    </button>
                  </div>
                </div>
              ) : null}
              {selectedBundle && selectedRow ? (
                <Portfolio
                  bundle={selectedBundle}
                  mode="hr"
                  calm
                  onContact={() => {
                    setContactFor(selectedRow);
                    setContactState(null);
                  }}
                  onShortlist={() => void shortlist(selectedRow)}
                  shortlisted={shortlisted.has(selected ?? "")}
                />
              ) : null}
            </motion.div>
          </div>
        </div>
      ) : (
        <div className="chat-hero center">
          <h2>No visible profiles matched.</h2>
          <p>Loosen a filter — wider location, broader salary, fewer must-haves — and search again.</p>
          <button
            className="btn-frame"
            type="button"
            onClick={() => setSearched(false)}
          >
            <span className="h tl"></span>
            <span className="h tr"></span>
            <span className="h bl"></span>
            <span className="h br"></span>
            Back to search
          </button>
        </div>
      )}

      {contactFor ? (
        <div className="modal-veil" onClick={() => setContactFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Message {String(contactFor.full_name).split(" ")[0]}</h3>
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
