"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSessionGuard } from "@/lib/session";
import { useLogoutRedirect } from "@/lib/session";
import { getRawSession, serializeRawSession, subscribeSession } from "@/lib/session";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, SearchX, SlidersHorizontal, Paperclip, Globe } from "lucide-react";
import type { Bundle, MatchView } from "@/components/Portfolio";
import DossierCard from "@/components/DossierCard";
import LocationPicker from "@/components/LocationPicker";
import SearchOrb from "@/components/SearchOrb";
import { CANONICAL_SKILLS } from "@/lib/skills";

type Result = Record<string, any>;

type Hr = { name: string; email: string };

type SavedShort = { id: string; name: string };
type PastContact = { candidate_id: string; name: string; channel: string; time: number };

const SEARCH_STAGE_COUNT = 4;

// Module flag: the brief-form intro runs on the session's first mount only.
let briefIntroDone = false;
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
  // Live guard: logout (any tab) immediately leaves the gated page.
  useSessionGuard("hr");
  // Belt-and-braces: any session END while this page is open bounces to home.
  useLogoutRedirect("/");
  // Live identity: re-reads localStorage on login/logout (incl. other tabs)
  // so outgoing mail and logs never sign as a previous user.
  const rawHr = useSyncExternalStore(
    subscribeSession,
    () => serializeRawSession(getRawSession()),
    () => "null",
  );
  const hr: Hr | null = useMemo(() => {
    if (rawHr === "null") return null;
    const [name = "", email = ""] = rawHr.split("\u0000");
    return name && email ? { name, email } : null;
  }, [rawHr]);
  const [authReady, setAuthReady] = useState(false);

  const [desc, setDesc] = useState("");
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("");
  const [seniority, setSeniority] = useState("mid");
  const [must, setMust] = useState("");
  const [nice, setNice] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState("remote");
  const [minExp, setMinExp] = useState(0);
  const [salMin, setSalMin] = useState(0);
  const [empType, setEmpType] = useState("full-time");
  const [currency, setCurrency] = useState("INR");
  const [deep, setDeep] = useState(false);
  const [relocation, setRelocation] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [tagHl, setTagHl] = useState(0);
  const jdFileRef = useRef<HTMLInputElement>(null);

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

  function applySuggestion(s: (typeof SUGGESTIONS)[number]) {
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
  const [editingBrief, setEditingBrief] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // First mount in this session plays the form intro; later remounts (e.g.
  // navbar transitions) render instantly so nothing appears to jump.
  const [briefIntro] = useState(() => {
    if (briefIntroDone) return false;
    briefIntroDone = true;
    return true;
  });
  // Frontend-only result tools: sort + hide-shortlisted + j/k navigation.
  // No backend involved — pure client re-ordering of the fetched rows.
  const [sortKey, setSortKey] = useState<"score" | "exp" | "name">("score");
  const [hideShort, setHideShort] = useState(false);
  const visibleResults = useMemo(() => {
    let list = [...results];
    if (hideShort) {
      const done = shortlisted;
      list = list.filter((r) => !done.has(String(r.id)));
    }
    if (sortKey === "exp") {
      list.sort((a, b) => (Number(b.total_experience_years) || 0) - (Number(a.total_experience_years) || 0));
    } else if (sortKey === "name") {
      list.sort((a, b) => String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")));
    } else {
      list.sort((a, b) => (Number(b.overall_score) || 0) - (Number(a.overall_score) || 0));
    }
    return list;
  }, [results, hideShort, sortKey, shortlisted]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [stage, setStage] = useState(0);
  const cache = useRef<Record<string, Bundle>>({});
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!contactFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContactFor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contactFor]);

  useEffect(() => {
    if (!searched) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "j" && e.key !== "k") return;
      const ids = visibleResults.map((r) => String(r.id));
      if (!ids.length) return;
      let i = ids.indexOf(String(selected));
      i = e.key === "j" ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
      if (ids[i]) void select(ids[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searched, visibleResults, selected]);

  useEffect(() => {
    if (!searching) return;
    const t = setInterval(
      () => setStage((s) => (s >= SEARCH_STAGE_COUNT - 1 ? s : s + 1)),
      1400,
    );
    return () => clearInterval(t);
  }, [searching]);

  const csv = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);

  // Defensive: flatten any nested cache-shaped row ({candidate_id, candidates:{...}})
  // so the side list, profile pane, and session restore all see flat rows.
  function normalizeRow(r: Result): Result {
    const nested = (r as { candidates?: unknown })?.candidates;
    if (nested && typeof nested === "object" && !r?.id) {
      const n = nested as Record<string, unknown>;
      const flat = r as { candidate_id?: unknown; score?: unknown };
      return {
        ...(n as object),
        ...r,
        id: n.id ?? flat.candidate_id,
        overall_score: flat.score ?? n.overall_score ?? r?.overall_score,
        candidates: undefined,
      } as Result;
    }
    return r;
  }

  function note(msg: string) {
    setFlash(msg);
    window.setTimeout(() => {
      setFlash((f) => (f === msg ? null : f));
    }, 3200);
  }

  function buildJob(description: string) {
    return {
      title: title.trim(),
      domain: domain.trim(),
      seniority,
      must_have: csv(must),
      nice_to_have: csv(nice),
      min_exp: Number(minExp) || 0,
      max_exp: 30, // single minimum slider; upper bound stays open
      salary_min: Number(salMin) || 0,
      currency: (currency.trim() || "INR").toUpperCase().slice(0, 3),
      location: location.trim(),
      remote_policy: mode,
      relocation_allowed: relocation,
      employment_type: empType,
      description,
    };
  }

  function scrollToBriefError() {
    requestAnimationFrame(() => {
      document.getElementById("brief-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function runSearch(job: Record<string, any>, isDeep = false) {
    setBusy(true);
    setSearching(true);
    setStage(0);
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
        scrollToBriefError();
        return;
      }
      const rows: Result[] = ((j.results ?? []) as Result[])
        .map(normalizeRow)
        .filter((r) => r?.id && r?.full_name);
      setResults(rows);
      setSearched(true);
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
      scrollToBriefError();
    } finally {
      setBusy(false);
      setSearching(false);
    }
  }

  function fail(msg: string) {
    setError(msg);
    setFiltersOpen(true);
    scrollToBriefError();
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return; // Enter-key during an in-flight search must not double-fire
    setError(null);
    const description = desc.trim();
    if (description.length < 20) {
      fail("Describe the role in a sentence or two (20+ characters) so matching has something to work with.");
      return;
    }
    if (!title.trim() || !domain.trim()) {
      fail("Role title and domain are required.");
      return;
    }
    if (!csv(must).length) {
      fail("Add at least one must-have skill (comma separated).");
      return;
    }
    await runSearch(buildJob(description), deep);
    setEditingBrief(false);
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
      if (!r.ok) {
        note("Couldn't save the shortlist — already saved, or the server is busy.");
        return;
      }
      setShortlisted((s) => new Set(s).add(String(cand.id)));
      note(`Shortlisted ${String(cand.full_name ?? "candidate").split(" ")[0]}.`);
      const saved = loadJSON<SavedShort[]>("tammy_shortlist", []);
      if (!saved.some((x) => x.id === String(cand.id))) {
        saved.unshift({ id: String(cand.id), name: String(cand.full_name ?? "Candidate") });
        saveJSON("tammy_shortlist", saved.slice(0, 100));
      }
    } catch {
      /* ignore */
    }
  }

  function levelLabel(level: unknown): string | null {
    if (level === "strong") return "Strong match";
    if (level === "partial") return "Partial match";
    if (level === "weak") return "Emerging match";
    return null;
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
    const skills: string[] = Array.isArray(c.top_skills) ? c.top_skills.slice(0, 3) : [];
    const avail: string | null =
      typeof c.availability_status === "string" && c.availability_status
        ? c.availability_status === "immediate"
          ? "Available now"
          : c.availability_status === "notice"
            ? "On notice"
            : c.availability_status
        : null;
    const meta = [c.domain, c.total_experience_years ? `${c.total_experience_years}y` : null, c.location_city, avail]
      .filter(Boolean)
      .join(" · ");
    const level = levelLabel(c.match_level);
    return (
      <motion.button
        key={String(c.id)}
        className={"res-card" + (active ? " active" : "")}
        onClick={() => void select(String(c.id))}
        type="button"
        aria-label={`Rank ${i + 1}: ${c.full_name} — ${c.headline ?? ""}${level ? ` — ${level}` : ""}`}
        title={`${c.full_name} — ${c.headline ?? ""}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: Math.min(i, 8) * 0.04 }}
      >
        <span className="res-rank" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
        {c.photo_url && /^https?:\/\//i.test(c.photo_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="res-ava" src={c.photo_url} alt="" loading="lazy" />
        ) : (
          <span className="res-ava res-ava-fallback" aria-hidden="true">{dot || "?"}</span>
        )}
        <span className="res-main">
          <span className="res-namerow">
            <h4>{c.full_name}</h4>
            {level ? (
              <span className={"lvl" + (c.match_level === "strong" ? " lvl-strong" : c.match_level === "partial" ? " lvl-partial" : " lvl-weak")}>{level}</span>
            ) : null}
          </span>
          {c.headline ? <p>{c.headline}</p> : null}
          {meta ? <span className="res-meta">{meta}</span> : null}
          {skills.length ? (
            <span className="res-chips">
              {skills.map((s) => (
                <span key={s} className="res-chip">{s}</span>
              ))}
            </span>
          ) : null}
        </span>
        {shortlisted.has(String(c.id)) ? (
          <span className="res-star" title="Shortlisted">★</span>
        ) : null}
      </motion.button>
    );
  }

  if (!authReady) {
    return (
      <div className="employer-search-page hire-shell">
        <div className="chat-hero" aria-busy="true" aria-label="Loading">
          <div className="app-kicker">Employer search</div>
          <h1>Who do you need?</h1>
          <p>Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (!hr) {
    return (
      <div className="employer-search-page hire-shell">
        <div className="chat-hero center" aria-busy="true" aria-label="Redirecting to login">
          <p>Taking you to the login page…</p>
        </div>
      </div>
    );
  }

  const EXP_PILLS: { label: string; value: number }[] = [
    { label: "Any", value: 0 },
    { label: "1\u20133 years", value: 1 },
    { label: "3\u20135 years", value: 3 },
    { label: "5\u20138 years", value: 5 },
    { label: "8+ years", value: 8 },
  ];

  const mustList = csv(must);
  const niceList = csv(nice);

  function addTag(raw: string) {
    const v = raw.trim().replace(/,+$/, "");
    if (!v) return;
    if ([...mustList, ...niceList].some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setMust([...mustList, v].join(", "));
    setTagInput("");
    setError(null);
  }

  function toggleTagRequired(skill: string) {
    const lower = skill.toLowerCase();
    if (mustList.some((x) => x.toLowerCase() === lower)) {
      setMust(mustList.filter((x) => x.toLowerCase() !== lower).join(", "));
      setNice([...niceList, skill].join(", "));
    } else {
      setNice(niceList.filter((x) => x.toLowerCase() !== lower).join(", "));
      setMust([...mustList, skill].join(", "));
    }
  }

  const tagQuery = tagInput.trim().toLowerCase();
  const tagTrimmed = tagInput.trim();
  const tagTaken = [...mustList, ...niceList];
  const skillOpts = CANONICAL_SKILLS.filter(
    (s) =>
      !tagTaken.some((v) => v.toLowerCase() === s.toLowerCase()) &&
      (!tagQuery || s.toLowerCase().includes(tagQuery)),
  ).slice(0, tagQuery ? 12 : 200);
  const tagExactHit = tagQuery
    ? CANONICAL_SKILLS.some((s) => s.toLowerCase() === tagQuery)
    : false;
  const tagAlreadyAdded = tagQuery
    ? tagTaken.some((v) => v.toLowerCase() === tagQuery)
    : false;
  const tagShowCustom = tagTrimmed.length > 0 && !tagExactHit && !tagAlreadyAdded;
  const tagTotal = skillOpts.length + (tagShowCustom ? 1 : 0);
  const tagHi = tagTotal ? Math.min(tagHl, tagTotal - 1) : 0;

  function pickSkill(s: string) {
    addTag(s);
    setTagOpen(false);
    setTagHl(0);
  }

  function removeTag(skill: string) {
    const lower = skill.toLowerCase();
    setMust(mustList.filter((x) => x.toLowerCase() !== lower).join(", "));
    setNice(niceList.filter((x) => x.toLowerCase() !== lower).join(", "));
  }

  function attachJD(file: File | undefined) {
    if (!file) return;
    const tag = `[Attached JD: ${file.name}]`;
    // Plain-text briefs are inlined so matching can actually read them;
    // PDFs/Word docs keep a filename note (paste key sections as text).
    if (/\.(txt|md)$/i.test(file.name) && file.size < 200_000) {
      const rd = new FileReader();
      rd.onload = () => {
        const text = String(rd.result ?? "").slice(0, 6000);
        setDesc((d) => (d ? `${d.trim()}\n\n${tag}\n${text}` : `${tag}\n${text}`));
      };
      rd.readAsText(file);
      return;
    }
    setDesc((d) => (d ? `${d.trim()}\n\n${tag} (paste key sections as text for matching)` : `${tag} (paste key sections as text for matching)`));
  }

  const renderBriefForm = () => (
    <motion.form
      onSubmit={search}
      // Intro plays on first paint only — replaying it on every client-side
      // remount reads as a layout jump during navbar transitions.
      initial={briefIntro ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="talent-hero-input">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          className="talent-prompt"
          placeholder="Describe the role you're hiring for…"
          aria-label="Role description"
          onKeyDown={(e) => {
            if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              void search();
            }
          }}
        />
        <div className="talent-prompt-foot">
          <div className="talent-prompt-pills" role="group" aria-label="Quick actions">
            <input
              ref={jdFileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                attachJD(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button type="button" className="talent-pill" onClick={() => jdFileRef.current?.click()}>
              <Paperclip /> Attach
            </button>
            <button
              type="button"
              className={"talent-pill" + (deep ? " on" : "")}
              onClick={() => setDeep(!deep)}
              aria-pressed={deep}
              title="Deep read: the judge reads top profiles fully. Slower, sharper."
            >
              <Globe /> Deep read
            </button>
          </div>
          <button
            className="talent-go"
            type="submit"
            disabled={busy}
            aria-label={busy ? "Searching…" : "Find candidates"}
            title="Find candidates"
          >
            {busy ? <span className="talent-go-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="filters talent-filters">
        <button
          type="button"
          className="filters-head"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="filters-ico"><SlidersHorizontal /></span>
          <span className="filters-titles">
            <strong>Refine Constraints</strong>
            <small>Tune the match</small>
          </span>
          <span className="talent-collapse-label">{filtersOpen ? "Collapse" : "Expand"}</span>
          <ChevronDown
            className="filters-chev"
            style={{ transform: filtersOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            aria-hidden="true"
          />
        </button>
        <AnimatePresence initial={false}>
          {filtersOpen ? (
            <motion.div
              key="fbody"
              className="filters-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
        <div className="talent-grid-3">
          <div className="field"><label>Role Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product Designer" /></div>
          <div className="field"><label>Domain / Industry</label><input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Fintech, AI" /></div>
          <div className="field"><label>Location</label><LocationPicker value={location} onChange={setLocation} placeholder="Search all locations…" /></div>
        </div>
        <div className="talent-div" />
        <div className="talent-grid-2">
          <div>
            <label className="talent-lab">Seniority</label>
            <div className="talent-seg" role="radiogroup" aria-label="Seniority level">
              {(["junior", "mid", "senior", "lead", "staff"] as const).map((s) => {
                const isActive = seniority === s;
                return (
                  <motion.button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={"talent-segbtn" + (isActive ? " on" : "")}
                    onClick={() => setSeniority(s)}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{ position: "relative" }}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="hire-seniority-pill"
                        className="seg-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    ) : null}
                    <span style={{ position: "relative" }}>
                      {s === "staff" ? "Staff+" : s[0].toUpperCase() + s.slice(1)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="talent-lab">Work Mode</label>
            <div className="talent-seg" role="radiogroup" aria-label="Work mode">
              {(["remote", "hybrid", "onsite"] as const).map((m) => {
                const isActive = mode === m;
                return (
                  <motion.button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={"talent-segbtn" + (isActive ? " on" : "")}
                    onClick={() => setMode(m)}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{ position: "relative" }}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="hire-workmode-pill"
                        className="seg-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    ) : null}
                    <span style={{ position: "relative" }}>{m[0].toUpperCase() + m.slice(1)}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="talent-div" />
        <div>
          <label className="talent-lab">Experience Range</label>
          <div className="talent-pills">
            {EXP_PILLS.map((p) => (
              <button key={p.label} type="button" className={"talent-expbtn" + (minExp === p.value ? " on" : "")} onClick={() => setMinExp(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="talent-div" />
        <div>
          <div className="talent-skills-head">
            <label className="talent-lab">Skills &amp; Tech Stack</label>
            <span className="talent-hint">Click a tag to toggle required</span>
          </div>
          <div className="talent-tagbox">
            {mustList.map((s) => (
              <span key={s} className="talent-tag req">
                <span>{s}</span>
                <span className="talent-tagreq">(Required)</span>
                <button type="button" onClick={() => removeTag(s)} aria-label={`remove ${s}`}>&times;</button>
              </span>
            ))}
            {niceList.map((s) => (
              <button key={s} type="button" className="talent-tag nice" onClick={() => toggleTagRequired(s)} title="Click to mark required">
                <span>{s}</span>
                <span aria-hidden="true">&times;</span>
              </button>
            ))}
            <div className="pick" style={{ flex: 1, minWidth: 110 }}>
              <input
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setTagHl(0);
                  setTagOpen(true);
                }}
                onFocus={() => setTagOpen(true)}
                onBlur={() => setTimeout(() => setTagOpen(false), 120)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setTagOpen(true);
                    if (tagTotal) setTagHl((h) => (h + 1) % tagTotal);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (tagTotal) setTagHl((h) => (h - 1 + tagTotal) % tagTotal);
                  } else if (e.key === "Enter" || e.key === ",") {
                    if (tagOpen && tagHi < skillOpts.length && skillOpts[tagHi]) {
                      e.preventDefault();
                      pickSkill(skillOpts[tagHi]);
                    } else if (tagOpen && tagShowCustom && tagHi === skillOpts.length) {
                      e.preventDefault();
                      pickSkill(tagTrimmed);
                    } else if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  } else if (e.key === "Escape") {
                    setTagOpen(false);
                  }
                }}
                placeholder="+ Add skill..."
                aria-label="Add skill"
                role="combobox"
                aria-controls="skill-listbox"
                aria-expanded={tagOpen}
                className="talent-taginput"
              />
              {tagOpen ? (
                <ul className="picklist" id="skill-listbox" role="listbox" aria-label="Skill suggestions">
                  {!tagQuery ? (
                    <li className="pickcount" aria-hidden="true">
                      {skillOpts.length} of {CANONICAL_SKILLS.length} skills — type to filter
                    </li>
                  ) : null}
                  {skillOpts.map((s, i) => (
                    <li key={s} role="option" aria-selected={i === tagHi}>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={i === tagHi ? "pick-hl" : ""}
                        onMouseEnter={() => setTagHl(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSkill(s);
                        }}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                  {tagShowCustom ? (
                    <li role="option" aria-selected={tagHi === skillOpts.length}>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={tagHi === skillOpts.length ? "pick-hl" : ""}
                        onMouseEnter={() => setTagHl(skillOpts.length)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSkill(tagTrimmed);
                        }}
                      >
                        + Add &ldquo;{tagTrimmed}&rdquo; (Other)
                      </button>
                    </li>
                  ) : null}
                  {!skillOpts.length && !tagShowCustom ? (
                    <li className="pickempty">No skills match — try another name.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          </div>
          {(!mustList.length && !niceList.length) ? (
            <div className="talent-sugg">
              <span>Suggestions:</span>
              {["Figma", "React", "TypeScript", "Node.js", "Go", "PostgreSQL", "Python", "Redis"].filter((s) => ![...mustList, ...niceList].some((x) => x.toLowerCase() === s.toLowerCase())).map((s) => (
                <button key={s} type="button" onClick={() => addTag(s)}>+ {s}</button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="talent-div" />
        <div>
          <label className="talent-lab">Target Compensation (Annual)</label>
          <div className="talent-comp">
            <div className="field">
              <label>Currency</label>
              <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
                <option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option><option value="AED">AED</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Amount</label>
              <input className="input" inputMode="numeric" value={salMin === 0 ? "" : String(salMin)} onChange={(e) => setSalMin(numOnly(e.target.value))} placeholder="e.g. 50000" aria-label="Expected salary amount" />
            </div>
          </div>
        </div>
        <div className="talent-div" />
        <div className="talent-grid-2">
          <div className="field">
            <label className="talent-lab" style={{ marginBottom: 8 }} htmlFor="emp-type">Employment</label>
            <select id="emp-type" className="select" value={empType} onChange={(e) => setEmpType(e.target.value)}><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="freelance">Freelance</option></select>
            <label className="checkrow" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={relocation} onChange={(e) => setRelocation(e.target.checked)} />
              Must be open to relocation
            </label>
          </div>
        </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {error ? <p id="brief-error" role="alert" className="err" style={{ marginTop: 12 }}>{error}</p> : null}
    </motion.form>
  );

  const selectedBundle = selected ? bundles[selected] : null;
  const selectedRow = selected ? results.find((r) => String(r.id) === selected) : null;
  const mustTop = csv(must).slice(0, 4).join(", ");
  const numOnly = (s: string) => Number(s.replace(/[^0-9]/g, "")) || 0;
  const searchStages = [
    { t: "Parsing must-haves", sub: mustTop || "reading the brief" },
    { t: "Embedding the role", sub: "turning the brief into a search vector" },
    { t: "Scanning evidence", sub: `${location.trim() || "anywhere"} · ${mode} · ${minExp === 0 ? "any exp" : `${minExp}+ yrs`}` },
    deep
      ? { t: "Deep reading top profiles", sub: "judge reads full profiles — slower, sharper" }
      : { t: "Ranking best fits", sub: "by evidence depth, not keywords" },
  ];

  return (
    <div className={"employer-search-page hire-shell" + (searched || searching ? " wide" : "")}>

      {!searched && !searching ? (
        <div className="chat-hero talent-wrap">
          <header className="talent-head">
            <h1>Who do you need?</h1>
            <p>Describe your target role in plain English. We&apos;ll automatically parse requirements and match verified candidates.</p>
          </header>
          <div className="talent-try">
            <span className="talent-try-label">Try:</span>
            {SUGGESTIONS.map((s) => (
              <button key={s.label} type="button" className="talent-trybtn" onClick={() => applySuggestion(s)}>
                {s.label}
              </button>
            ))}
          </div>
          {renderBriefForm()}
        </div>
      ) : searching ? (
        <div className="searching">
          <SearchOrb searching />
          <motion.div
            className="search-pulse"
            animate={{ opacity: [0.35, 1, 0.35], scale: [0.97, 1, 0.97] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            <span className="score" style={{ fontSize: 14 }}>◌ Searching</span>
          </motion.div>
          <h2>Reading your brief…</h2>
          <p>Embedding the role, matching evidence across profiles, ranking the best fits.</p>
          <ol className="stages">
            {searchStages.map((s, i) => (
              <motion.li
                key={s.t}
                className={"stage" + (i < stage ? " done" : "") + (i === stage ? " active" : "")}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
              >
                <span className="st-ic" aria-hidden="true">
                  {i < stage ? <Check /> : i === stage ? <i /> : null}
                </span>
                <span>
                  {s.t}
                  <small>{s.sub}</small>
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      ) : results.length ? (
        <div ref={resultsRef} className="results-wrap res-wrap" style={{ scrollMarginTop: 12 }}>
          {flash ? (
            <p className="flash-note" role="status">{flash}</p>
          ) : null}
          <div className="res-tools" role="group" aria-label="Result tools">
            <div className="res-seg" role="radiogroup" aria-label="Sort results">
              {(["score", "exp", "name"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={sortKey === k}
                  className={"res-segbtn" + (sortKey === k ? " on" : "")}
                  onClick={() => setSortKey(k)}
                >
                  {k === "score" ? "Best match" : k === "exp" ? "Most experience" : "Name A–Z"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={"talent-pill" + (hideShort ? " on" : "")}
              onClick={() => setHideShort((v) => !v)}
              aria-pressed={hideShort}
            >
              {hideShort ? "✓ " : ""}Hide shortlisted
            </button>
            <span className="results-keys">j / k to move</span>
            <span className="rowline res-actions">
              <button
                className="btn-frame"
                type="button"
                aria-expanded={editingBrief}
                onClick={() => {
                  setEditingBrief((v) => !v);
                  setFiltersOpen(true);
                }}
              >
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                {editingBrief ? "Close brief" : "Edit brief"}
              </button>
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
            </span>
          </div>
          {editingBrief ? <div className="brief-panel">{renderBriefForm()}</div> : null}
          <div className="res-grid">
            <div className="res-list" role="listbox" aria-label="Ranked candidates">
              {visibleResults.map((c, i) => rowCard(c, i))}
              {!visibleResults.length && results.length ? (
                <p className="pickempty" style={{ padding: 16 }}>
                  All matches are shortlisted — toggle the filter to see them.
                </p>
              ) : null}
            </div>
            <motion.div
              className="res-detail"
              key={selected}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="res-viewbar">
                <span className="who">
                  Viewing as {hr.name} · messages are logged
                </span>
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
                <DossierCard
                  bundle={selectedBundle}
                  match={selectedRow as unknown as MatchView}
                  shortlisted={shortlisted.has(selected ?? "")}
                  dossierHref={`/talent/${selected}`}
                  onContact={() => {
                    setContactFor(selectedRow);
                    setContactState(null);
                  }}
                  onToggleShortlist={() => void shortlist(selectedRow)}
                />
              ) : null}
            </motion.div>
          </div>
        </div>
      ) : (
        <div className="chat-hero center">
          <SearchX className="empty-icon" aria-hidden="true" />
          <h2>No visible profiles matched.</h2>
          <p>
            {[title.trim(), domain.trim(), `${mode} · ${minExp === 0 ? "any exp" : `${minExp}+ yrs`}`]
              .filter(Boolean)
              .join(" · ")}
            <br />
            Loosen a filter — wider location, broader salary, fewer must-haves — and search again.
          </p>
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

      <AnimatePresence>
        {contactFor ? (
          <motion.div
            className="modal-veil"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setContactFor(null)}
          >
            <motion.div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Message ${String(contactFor.full_name).split(" ")[0]}`}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Message {String(contactFor.full_name).split(" ")[0]}</h3>
              <p>
                As {hr.name} ({hr.email}). Logged in the open-contact record and
                emailed to the candidate.
              </p>
              <div className="field">
                <label htmlFor="hire-channel">Channel</label>
                <select id="hire-channel" className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>
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
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
