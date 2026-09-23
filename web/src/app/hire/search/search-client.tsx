"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Briefcase,
  Check,
  CircleAlert,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { jobSchema, toFieldErrors } from "@/lib/validators";
import { DOMAINS, EMPLOYMENT_TYPES, normalizeSkills } from "@/lib/skills";
import SkillPicker from "@/components/SkillPicker";
import Avatar from "@/components/Avatar";
import { TraceFill } from "@/components/landing-client";

// --- types ------------------------------------------------------------------

type Sub = Partial<
  Record<"semantic" | "skill" | "depth" | "constraints" | "seniority", number>
>;

type Judge = {
  overall_score?: number;
  recommendation?: string;
  strengths?: string[];
  gaps?: string[];
  matched_requirements?: string[];
  missing_requirements?: string[];
  interview_questions?: string[];
  salary_fit?: string;
  location_fit?: string;
  seniority_fit?: string;
};

type Row = {
  id: string;
  full_name?: string | null;
  headline?: string | null;
  domain?: string | null;
  total_experience_years?: number | null;
  min_salary?: number | null;
  salary_frequency?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  resume_url?: string | null;
  photo_url?: string | null;
  remote_preference?: string | null;
  location_city?: string | null;
  availability_status?: string | null;
  overall_score?: number | null;
  match_level?: string | null;
  sub_scores?: Sub | null;
  top_skills?: string[] | null;
  judge?: Judge | null;
};

type Session = { name?: string; email: string };

// --- static config ----------------------------------------------------------

const EXAMPLES = [
  {
    label: "Designer · fintech · remote",
    prompt:
      "Product designer for a fintech team — owns flows end to end, from onboarding to payouts, and makes dense data tables legible. Figma-first, comfortable shipping with engineers, remote across India.",
    skills: ["Figma"],
  },
  {
    label: "Backend · Node/Postgres",
    prompt:
      "Backend engineer on Node/Postgres — designs the service boundaries, owns the schema, and keeps p95 honest under load. Payments experience is a plus; rigor is the requirement.",
    skills: ["Node.js", "PostgreSQL"],
  },
  {
    label: "Design systems lead",
    prompt:
      "Design systems lead — builds and governs the component library two product teams actually ship with. Tokens to documentation, adoption metrics, and a migration plan people finish.",
    skills: ["Design Systems", "Figma"],
  },
] as const;

const SENIORITY_OPTS = [
  { v: "intern", label: "Intern" },
  { v: "junior", label: "Junior" },
  { v: "mid", label: "Mid" },
  { v: "senior", label: "Senior" },
  { v: "lead", label: "Lead" },
  { v: "staff", label: "Staff" },
] as const;

const MODE_OPTS = [
  { v: "remote", label: "Remote" },
  { v: "hybrid", label: "Hybrid" },
  { v: "onsite", label: "On-site" },
] as const;

const EXP_RANGES = [
  { label: "Any", min: 0, max: 50 },
  { label: "1–3 years", min: 1, max: 3 },
  { label: "3–5 years", min: 3, max: 5 },
  { label: "5–8 years", min: 5, max: 8 },
  { label: "8+ years", min: 8, max: 50 },
] as const;

const SUGGESTIONS = [
  "Figma",
  "React",
  "TypeScript",
  "Node.js",
  "Go",
  "PostgreSQL",
  "Python",
  "Redis",
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD", "AED", "AUD", "CAD"];

const SUB_ROWS: [keyof Sub, string][] = [
  ["semantic", "Semantic match"],
  ["skill", "Skills overlap"],
  ["depth", "Depth of work"],
  ["constraints", "Constraints"],
  ["seniority", "Seniority fit"],
];

// --- helpers ----------------------------------------------------------------

const levelOf = (score: number): "strong" | "partial" | "weak" =>
  score >= 75 ? "strong" : score >= 50 ? "partial" : "weak";

const LEVEL_LABEL = {
  strong: "Strong match",
  partial: "Partial",
  weak: "Weak",
} as const;

const MODE_LABEL: Record<string, string> = {
  remote: "Remote",
  remote_only: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  flexible: "Flexible",
};

const AVAIL_LABEL: Record<string, string> = {
  immediate: "Available now",
  notice: "On notice",
  inactive: "Not looking",
};

function salaryLine(min: number | null | undefined, freq: string | null | undefined) {
  if (typeof min !== "number" || min <= 0) return null;
  const suffix =
    freq === "yearly" ? "/yr" : freq === "hourly" ? "/hr" : freq === "monthly" ? "/mo" : "";
  return `min ${min.toLocaleString()}${suffix ? ` ${suffix}` : ""}`;
}

const hasBars = (sub: Sub | null | undefined) =>
  !!sub && SUB_ROWS.filter(([k]) => typeof sub[k] === "number").length >= 3;

/** First clause of the brief becomes the job title the scorer and cache key use. */
function deriveTitle(p: string): string {
  const first =
    p.split(/\n/)[0].trim() || p.trim().split(/\s+/).slice(0, 8).join(" ");
  const cut = first.search(/\s+[—–|·]\s+/);
  let t = cut > 6 ? first.slice(0, cut).trim() : first;
  if (t.length > 90) t = t.slice(0, 90).replace(/\s+\S*$/, "");
  return t || "Open role";
}

function flattenErrors(errors: unknown): Record<string, string> {
  const flat = errors as
    | { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
    | undefined;
  const out: Record<string, string> = {};
  if (flat?.fieldErrors) {
    for (const [k, v] of Object.entries(flat.fieldErrors)) {
      if (Array.isArray(v) && v[0]) out[k] = v[0];
    }
  }
  if (Array.isArray(flat?.formErrors) && flat.formErrors[0]) out._form = flat.formErrors[0];
  return out;
}

// --- presentational pieces --------------------------------------------------

function LevelPill({ level }: { level: "strong" | "partial" | "weak" }) {
  return <span className={`level-pill level-${level}`}>{LEVEL_LABEL[level]}</span>;
}

function ContactChip({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className="tag hover:text-brand-text transition-colors"
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {icon}
      {label}
    </a>
  );
}

function SegGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            className={`seg-btn ${value === o.v ? "is-on" : ""}`}
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubScores({ sub }: { sub: Sub }) {
  return (
    <div className="grid gap-3">
      {SUB_ROWS.map(([k, label]) => {
        const v = sub[k];
        if (typeof v !== "number") return null;
        const pct = Math.max(0, Math.min(100, Math.round(v * 100)));
        return (
          <div key={k}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-body">{label}</span>
              <span className="font-mono text-[12px] text-muted">{pct}%</span>
            </div>
            <TraceFill width={`${pct}%`} bg="#1F2DE6" />
          </div>
        );
      })}
    </div>
  );
}

function JudgePanel({ judge }: { judge: Judge }) {
  const fits: [string, string | undefined][] = [
    ["Salary", judge.salary_fit],
    ["Location", judge.location_fit],
    ["Seniority", judge.seniority_fit],
  ];
  return (
    <div className="grid gap-4">
      {judge.recommendation ? (
        <p className="text-[14.5px] leading-[1.6] text-body">{judge.recommendation}</p>
      ) : null}
      {(judge.strengths?.length || judge.gaps?.length) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {judge.strengths?.length ? (
            <div>
              <p className="field-label mb-2">Strengths</p>
              <ul className="grid gap-2">
                {judge.strengths.map((s, i) => (
                  <li key={`${i}-${s}`} className="flex gap-2 text-[14px] leading-[1.55] text-body">
                    <Check
                      size={15}
                      className="flex-none mt-0.5"
                      style={{ color: "var(--success)" }}
                      aria-hidden="true"
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {judge.gaps?.length ? (
            <div>
              <p className="field-label mb-2">Gaps</p>
              <ul className="grid gap-2">
                {judge.gaps.map((g, i) => (
                  <li key={`${i}-${g}`} className="flex gap-2 text-[14px] leading-[1.55] text-body">
                    <CircleAlert
                      size={15}
                      className="flex-none mt-0.5"
                      style={{ color: "var(--warn)" }}
                      aria-hidden="true"
                    />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {(judge.matched_requirements?.length || judge.missing_requirements?.length) ? (
        <div className="flex flex-wrap gap-2">
          {(judge.matched_requirements ?? []).map((m, i) => (
            <span key={`m-${i}-${m}`} className="tag" style={{ color: "var(--success)" }}>
              {m}
            </span>
          ))}
          {(judge.missing_requirements ?? []).map((m, i) => (
            <span key={`x-${i}-${m}`} className="tag" style={{ color: "var(--warn)" }}>
              {m}
            </span>
          ))}
        </div>
      ) : null}
      {judge.interview_questions?.length ? (
        <div>
          <p className="field-label mb-2">Interview questions worth asking</p>
          <ol className="grid gap-2 list-decimal pl-5 text-[14px] leading-[1.55] text-body">
            {judge.interview_questions.map((q, i) => (
              <li key={`${i}-q`}>{q}</li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {fits.map(([label, value]) => (
          <span key={label} className="tag">
            {label}:{" "}
            <strong
              style={{
                color:
                  value === "good"
                    ? "var(--success)"
                    : value === "poor"
                      ? "var(--warn)"
                      : undefined,
              }}
            >
              {value ?? "unknown"}
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  row,
  sl,
  onShortlist,
}: {
  row: Row;
  sl: "saving" | "saved" | "error" | undefined;
  onShortlist: (id: string) => void;
}) {
  const score = typeof row.overall_score === "number" ? Math.round(row.overall_score) : null;
  const level =
    row.match_level === "strong" || row.match_level === "partial" || row.match_level === "weak"
      ? row.match_level
      : score != null
        ? levelOf(score)
        : null;
  const salary = salaryLine(row.min_salary, row.salary_frequency);

  return (
    <article className="rounded-2xl bg-surface shadow-soft-md p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <Avatar name={row.full_name ?? "Candidate"} src={row.photo_url} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Link
              href={`/talent/${row.id}`}
              className="text-[17px] font-semibold text-ink hover:text-brand-text transition-colors tracking-[-0.01em]"
            >
              {row.full_name ?? "Candidate"}
            </Link>
            {level ? <LevelPill level={level} /> : null}
          </div>
          {row.headline ? (
            <p className="text-[14.5px] text-body mt-0.5 truncate">{row.headline}</p>
          ) : null}
        </div>
        <div className="text-right flex-none">
          {score != null ? (
            <>
              <p className="text-[26px] leading-none font-semibold text-ink score-num">{score}</p>
              <p className="font-mono text-[11px] text-muted mt-1">score</p>
            </>
          ) : (
            <p className="font-mono text-[11px] text-muted mt-1">unscored</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[13px] text-muted">
        {row.domain ? (
          <span className="inline-flex items-center gap-1.5">
            <Briefcase size={13} aria-hidden="true" /> {row.domain}
          </span>
        ) : null}
        {typeof row.total_experience_years === "number" ? (
          <span>{row.total_experience_years} yrs</span>
        ) : null}
        {row.location_city ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} aria-hidden="true" /> {row.location_city}
          </span>
        ) : null}
        {row.remote_preference && MODE_LABEL[row.remote_preference] ? (
          <span>{MODE_LABEL[row.remote_preference]}</span>
        ) : null}
        {row.availability_status && AVAIL_LABEL[row.availability_status] ? (
          <span>{AVAIL_LABEL[row.availability_status]}</span>
        ) : null}
        {salary ? <span>{salary}</span> : null}
      </div>

      {score != null ? (
        <div className="mt-3.5">
          <TraceFill width={`${score}%`} bg="#1F2DE6" />
        </div>
      ) : null}

      {row.top_skills?.length ? (
        <div className="flex flex-wrap gap-2 mt-3.5">
          {row.top_skills.map((s) => (
            <span className="tag" key={s}>
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {(row.judge || hasBars(row.sub_scores)) ? (
        <div className="mt-4 pt-4 border-t border-line grid gap-3">
          {row.judge ? (
            <details className="judge">
              <summary>
                Deep read — the judge&apos;s take <ChevronRight aria-hidden="true" />
              </summary>
              <div className="mt-4">
                <JudgePanel judge={row.judge} />
              </div>
            </details>
          ) : null}
          {hasBars(row.sub_scores) ? (
            <details className="judge">
              <summary>
                Score breakdown <ChevronRight aria-hidden="true" />
              </summary>
              <div className="mt-4">
                <SubScores sub={row.sub_scores as Sub} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 mt-5 pt-4 border-t border-line">
        <Link href={`/talent/${row.id}`} className="btn btn-primary btn-sm press">
          View page <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className="btn btn-secondary btn-sm press"
          onClick={() => onShortlist(row.id)}
          disabled={sl === "saving" || sl === "saved"}
        >
          {sl === "saving" ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : sl === "saved" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Bookmark size={14} aria-hidden="true" />
          )}
          {sl === "saved" ? "Shortlisted" : sl === "saving" ? "Saving…" : "Shortlist"}
        </button>

        {row.contact_email ? (
          <ContactChip
            href={`mailto:${row.contact_email}`}
            icon={<Mail size={13} aria-hidden="true" />}
            label="Email"
          />
        ) : null}
        {row.contact_phone ? (
          <ContactChip
            href={`tel:${row.contact_phone}`}
            icon={<Link2 size={13} aria-hidden="true" />}
            label={row.contact_phone}
          />
        ) : null}
        {row.linkedin_url ? (
          <ContactChip
            href={row.linkedin_url}
            icon={<ExternalLink size={13} aria-hidden="true" />}
            label="LinkedIn"
          />
        ) : null}
        {row.github_url ? (
          <ContactChip
            href={row.github_url}
            icon={<ExternalLink size={13} aria-hidden="true" />}
            label="GitHub"
          />
        ) : null}
        {row.portfolio_url ? (
          <ContactChip
            href={row.portfolio_url}
            icon={<ExternalLink size={13} aria-hidden="true" />}
            label="Portfolio"
          />
        ) : null}
        {row.resume_url ? (
          <ContactChip
            href={row.resume_url}
            icon={<FileText size={13} aria-hidden="true" />}
            label="Resume"
          />
        ) : null}
        {sl === "error" ? (
          <span className="field-error" role="alert">
            Could not save — try again.
          </span>
        ) : null}
      </div>
    </article>
  );
}

// --- the client -------------------------------------------------------------

export default function SearchClient({
  initialSession,
}: {
  initialSession: Session | null;
}) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [prompt, setPrompt] = useState("");
  const [deep, setDeep] = useState(false);
  const [refineOpen, setRefineOpen] = useState(true);
  const [seniority, setSeniority] = useState("mid");
  const [mode, setMode] = useState("remote");
  const [expLabel, setExpLabel] = useState<string>("Any");
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [domain, setDomain] = useState("Software Development");
  const [employment, setEmployment] = useState("full-time");
  const [currency, setCurrency] = useState("INR");
  const [amount, setAmount] = useState("");
  const [relocation, setRelocation] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState({ queryText: "", cached: false, deep: false });
  const [deepError, setDeepError] = useState<string | null>(null);
  const [sl, setSl] = useState<Record<string, "saving" | "saved" | "error">>({});

  const clearErr = (key: string) =>
    setErrs((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const applyExample = (ex: (typeof EXAMPLES)[number]) => {
    setPrompt(ex.prompt);
    setMustHave((prev) => (prev.length ? prev : [...normalizeSkills([...ex.skills])]));
    setErrs({});
    setNotice(null);
  };

  const toggleSuggestion = (raw: string) => {
    const n = normalizeSkills([raw])[0] ?? raw;
    const key = n.toLowerCase();
    setMustHave((prev) =>
      prev.some((s) => s.toLowerCase() === key)
        ? prev.filter((s) => s.toLowerCase() !== key)
        : [...prev, n],
    );
    clearErr("must_have");
  };

  const run = async () => {
    if (busy) return;
    const text = prompt.trim();
    const range = EXP_RANGES.find((r) => r.label === expLabel) ?? EXP_RANGES[0];
    const amountNum = amount.trim() ? Number(amount.replace(/[,\s]/g, "")) : 0;
    const job = {
      title: deriveTitle(text),
      domain,
      seniority,
      must_have: mustHave,
      nice_to_have: [] as string[],
      min_exp: range.min,
      max_exp: range.max,
      salary_min: amountNum,
      currency,
      location: "",
      remote_policy: mode,
      relocation_allowed: relocation,
      employment_type: employment,
      description: text,
      responsibilities: "",
      screening_requirements: "",
    };

    const parsed = jobSchema.safeParse(job);
    if (!parsed.success) {
      setErrs(toFieldErrors(parsed.error));
      setNotice("Fix the highlighted fields.");
      return;
    }
    setErrs({});
    setNotice(null);
    setDeepError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, limit: deep ? 10 : 30, deep }),
      });
      const body = (await res.json().catch(() => null)) as {
        results?: Row[];
        queryText?: string;
        cached?: boolean;
        deep?: boolean;
        deepError?: string;
        error?: string;
        errors?: unknown;
      } | null;

      if (res.status === 401) {
        setSession(null);
        return;
      }
      if (res.status === 429) {
        setNotice("Rate limit reached — take a short pause and try again.");
        return;
      }
      if (res.status === 400 && body?.errors) {
        setErrs(flattenErrors(body.errors));
        setNotice("Fix the highlighted fields.");
        return;
      }
      if (!res.ok) {
        setNotice(body?.error || "Search failed — try again.");
        return;
      }
      setResults(Array.isArray(body?.results) ? body.results : []);
      setMeta({
        queryText: typeof body?.queryText === "string" ? body.queryText : "",
        cached: body?.cached === true,
        deep: body?.deep === true,
      });
      setDeepError(typeof body?.deepError === "string" ? body.deepError : null);
    } catch {
      setNotice("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  const shortlist = async (id: string) => {
    if (sl[id]) return;
    setSl((s) => ({ ...s, [id]: "saving" }));
    try {
      const res = await fetch("/api/shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: id }),
      });
      if (res.status === 401) {
        setSession(null);
        setSl((s) => {
          const next = { ...s };
          delete next[id];
          return next;
        });
        return;
      }
      if (res.ok) {
        setSl((s) => ({ ...s, [id]: "saved" }));
        return;
      }
      if (res.status === 429) setNotice("Shortlist rate limit — pause a moment and retry.");
      setSl((s) => ({ ...s, [id]: "error" }));
    } catch {
      setSl((s) => ({ ...s, [id]: "error" }));
    }
  };

  // --- session gate ----------------------------------------------------------
  if (!session) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl bg-surface shadow-soft-md p-7 sm:p-9 text-center">
        <div className="w-11 h-11 rounded-full bg-brand-soft text-brand-text grid place-items-center mx-auto">
          <Search size={20} aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.01em] text-ink">
          Employer session required.
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6] text-body">
          Results carry candidate contact channels, so searches sit behind a
          per-device employer session — one email opens it.
        </p>
        <Link href="/hire/login" className="btn btn-primary press mt-6">
          Open a session <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const composerErr = errs.description || errs.title;

  return (
    <div>
      {/* session line */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 mb-5 text-[13px] text-muted">
        <span
          className="pulse-dot inline-block w-2 h-2 rounded-full"
          style={{ background: "var(--success)" }}
          aria-hidden="true"
        />
        <span className="font-mono text-[11.5px] uppercase tracking-[0.14em]">
          {session.name ? `${session.name} · ` : ""}
          {session.email}
        </span>
        <span aria-hidden="true">·</span>
        <Link
          href="/hire/login"
          className="text-muted underline hover:text-brand-text transition-colors"
        >
          Switch session
        </Link>
      </div>

      {/* try examples */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted mr-1">
          Try
        </span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="chip-toggle"
            onClick={() => applyExample(ex)}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* composer */}
      <div className="composer">
        <textarea
          className="composer-input"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            clearErr("description");
            clearErr("title");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="Describe the role you're hiring for…"
          aria-label="Describe the role you're hiring for"
          maxLength={10000}
          aria-invalid={composerErr ? true : undefined}
        />
        <div className="composer-bar">
          <button
            type="button"
            className={`chip-toggle ${deep ? "is-on" : ""}`}
            aria-pressed={deep}
            onClick={() => setDeep((v) => !v)}
          >
            <Sparkles size={14} aria-hidden="true" /> Deep read
          </button>
          <button
            type="button"
            className="send-btn"
            onClick={() => void run()}
            disabled={busy}
            aria-label="Run search"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {composerErr ? (
        <span className="field-error block mt-2" role="alert">
          {composerErr}
        </span>
      ) : null}
      {notice ? (
        <div className="notice notice-warn mt-4" role="status">
          <CircleAlert aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* refine constraints */}
      <div className="rounded-2xl bg-surface shadow-soft-md mt-5 overflow-hidden">
        <button
          type="button"
          className="btn-plain flex w-full items-center justify-between gap-3 p-5"
          onClick={() => setRefineOpen((o) => !o)}
          aria-expanded={refineOpen}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span
              className="w-9 h-9 rounded-xl bg-inset grid place-items-center flex-none"
              aria-hidden="true"
            >
              <Briefcase size={16} className="text-ink" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink tracking-[-0.01em]">
                Refine constraints
              </span>
              <span className="block text-[13px] text-muted mt-0.5">Tune the match</span>
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted flex-none">
            {refineOpen ? "Collapse" : "Expand"}
            <ChevronRight
              size={15}
              className={`transition-transform ${refineOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </span>
        </button>

        {refineOpen ? (
          <div className="px-5 pb-6 pt-5 border-t border-line grid gap-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <SegGroup
                label="Seniority"
                value={seniority}
                options={SENIORITY_OPTS}
                onChange={setSeniority}
              />
              <SegGroup label="Work mode" value={mode} options={MODE_OPTS} onChange={setMode} />
            </div>

            <div className="field">
              <span className="field-label">Experience range</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {EXP_RANGES.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    className={`chip-toggle ${expLabel === r.label ? "is-on" : ""}`}
                    aria-pressed={expLabel === r.label}
                    onClick={() => setExpLabel(r.label)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <SkillPicker
                id="refine-skills"
                label="Skills &amp; tech stack"
                required
                hint="The bar to clear — these are the must-haves."
                placeholder="+ Add skill…"
                error={errs.must_have}
                value={mustHave}
                onChange={(v) => {
                  setMustHave(v);
                  clearErr("must_have");
                }}
              />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted mr-1">
                  Suggestions
                </span>
                {SUGGESTIONS.map((s) => {
                  const n = normalizeSkills([s])[0] ?? s;
                  const on = mustHave.some((m) => m.toLowerCase() === n.toLowerCase());
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`chip-toggle ${on ? "is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleSuggestion(s)}
                    >
                      {on ? null : <span aria-hidden="true">+</span>}
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Target compensation (annual)</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field mb-0">
                  <label className="field-label" htmlFor="refine-currency">
                    Currency
                  </label>
                  <select
                    id="refine-currency"
                    className="select"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field mb-0">
                  <label className="field-label" htmlFor="refine-amount">
                    Amount
                  </label>
                  <input
                    id="refine-amount"
                    className="input"
                    inputMode="numeric"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      clearErr("salary_min");
                    }}
                    aria-invalid={errs.salary_min ? true : undefined}
                  />
                  {errs.salary_min ? (
                    <span className="field-error" role="alert">
                      {errs.salary_min}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field mb-0">
                <label className="field-label" htmlFor="refine-domain">
                  Domain
                </label>
                <select
                  id="refine-domain"
                  className="select"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {errs.domain ? (
                  <span className="field-error" role="alert">
                    {errs.domain}
                  </span>
                ) : null}
              </div>
              <div className="field mb-0">
                <label className="field-label" htmlFor="refine-employment">
                  Employment
                </label>
                <select
                  id="refine-employment"
                  className="select"
                  value={employment}
                  onChange={(e) => setEmployment(e.target.value)}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={relocation}
                onChange={(e) => setRelocation(e.target.checked)}
              />
              <span>Must be open to relocation</span>
            </label>
          </div>
        ) : null}
      </div>

      {/* results */}
      {results !== null ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-[-0.02em] text-ink">
              {results.length} {results.length === 1 ? "candidate" : "candidates"}
              {meta.deep ? (
                <span className="tag ml-3 align-middle inline-flex">
                  <Sparkles size={12} aria-hidden="true" /> Deep read
                </span>
              ) : null}
              {meta.cached ? (
                <span className="font-mono text-[11px] text-muted ml-3 align-middle">
                  repeat query
                </span>
              ) : null}
            </h2>
          </div>
          {meta.queryText ? (
            <p className="font-mono text-[11.5px] text-muted mt-1.5 truncate">
              parsed: {meta.queryText}
            </p>
          ) : null}
          {deepError ? (
            <div className="notice notice-warn mt-4" role="status">
              <Info aria-hidden="true" />
              <span>{deepError}</span>
            </div>
          ) : null}
          {results.length === 0 ? (
            <div className="empty-note mt-5">
              No matches yet. The pool fills as candidates publish pages — try
              looser skills or a wider experience range.
            </div>
          ) : (
            <div className="grid gap-5 mt-5">
              {results.map((r) => (
                <ResultCard
                  key={r.id}
                  row={r}
                  sl={sl[r.id]}
                  onShortlist={(id) => void shortlist(id)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-note mt-8">
          Your shortlist lands here — ranked, scored, with every sub-score one
          click open.
        </div>
      )}
    </div>
  );
}
