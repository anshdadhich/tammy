"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

export type JudgeView = {
  overall_score?: number | null;
  recommendation?: string | null;
  strengths?: string[] | null;
  gaps?: string[] | null;
  risk_factors?: string[] | null;
  matched_requirements?: string[] | null;
  missing_requirements?: string[] | null;
  project_evidence?: string[] | null;
  interview_questions?: string[] | null;
  raw?: Record<string, unknown> | null;
} | null;

export type MatchView = {
  overall_score?: number | null;
  match_level?: string | null;
  sub_scores?: Record<string, number> | null;
  judge?: JudgeView;
  top_skills?: string[] | null;
} | null;

export type Bundle = {
  candidate: Record<string, any>;
  profile: { summary_markdown?: string | null } | null;
  projects: Record<string, any>[];
  oss?: Record<string, any>[];
  experiences: Record<string, any>[];
  education: Record<string, any>[];
  skills: {
    experience_years?: number | null;
    proficiency_level?: string | null;
    skills?: { name?: string } | { name?: string }[] | null;
  }[];
  depths?: Record<string, Record<string, any>>;
  contact_log?: Record<string, any>[];
  matches?: Record<string, any>[];
  shortlists?: Record<string, any>[];
};

function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function yearRange(start?: string | null, end?: string | null, current?: boolean): string {
  const y = (d?: string | null) => (d ? d.slice(0, 4) : "");
  const s = y(start) || "—";
  const e = current ? "Present" : y(end) || "—";
  return `${s} — ${e}`;
}

function isHttp(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

function driveId(url: string): string | null {
  const m =
    url.match(/\/d\/([-\w]{10,})/) || url.match(/[?&]id=([-\w]{10,})/);
  return m ? m[1] : null;
}

function availLabel(v: unknown): string | null {
  if (v === "immediate") return "Available now";
  if (v === "notice") return "On notice";
  if (v === "inactive") return "Inactive";
  return null;
}

/** Split a stored impact blob back into readable paragraphs. */
function impactParts(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/\n\s*\n|\s\|\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Minimal markdown renderer for AI summaries (headings, bullets, bold, paragraphs). */
function Md({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={key}>
          {list.map((li, i) => (
            <li key={i}>
              <Rich t={li} />
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flush(`u${i}`);
      return;
    }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) {
      flush(`u${i}`);
      blocks.push(
        <h4 key={i}>
          <Rich t={h[1]} />
        </h4>,
      );
      return;
    }
    const b = line.match(/^[-*]\s+(.*)/);
    if (b) {
      list.push(b[1]);
      return;
    }
    flush(`u${i}`);
    blocks.push(
      <p key={i}>
        <Rich t={line} />
      </p>,
    );
  });
  flush("u-end");
  return <div className="md">{blocks}</div>;
}

function Rich({ t }: { t: string }) {
  const parts = t.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Resolve a candidates URL column: http(s) → as-is, storage path → signed URL. */
function useResolvedUrl(
  bucket: "photos" | "resumes" | "portfolios",
  value: unknown,
): string | null {
  const [url, setUrl] = useState<string | null>(
    isHttp(value) ? (value as string) : null,
  );
  useEffect(() => {
    if (isHttp(value)) {
      setUrl(value as string);
      return;
    }
    if (typeof value !== "string" || !value) {
      setUrl(null);
      return;
    }
    let live = true;
    fetch(`/api/uploads?bucket=${bucket}&path=${encodeURIComponent(value)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live) setUrl(j?.signedUrl ?? null);
      })
      .catch(() => {
        if (live) setUrl(null);
      });
    return () => {
      live = false;
    };
  }, [bucket, value]);
  return url;
}

/* ─── Spec-sheet primitives (zinc/mono design language) ─── */

/** Section eyebrow: uppercase mono label with a rule filling the rest of the row. */
function Eyebrow({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="spec-eyebrow">
      <span>{children}</span>
      {sub ? <span className="spec-eyebrow-sub mono">{sub}</span> : null}
      <i aria-hidden="true" />
    </div>
  );
}

/** Status badge with a live dot — used for availability and verified states. */
function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="spec-badge mono">
      <i className="spec-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Copy-to-clipboard pill in the hero (CLI-install joke + email fallback). */
function CopyPill({ value, onCopied }: { value: string; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="spec-cli-pill mono"
      title="Copy to clipboard"
      onClick={() => {
        try {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          onCopied?.();
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      <span className="spec-cli-prompt" aria-hidden="true">$</span>
      <code>{value}</code>
      <span className="spec-cli-copy" aria-hidden="true">{copied ? "copied ✓" : "copy"}</span>
    </button>
  );
}

function SpecTag({ children }: { children: React.ReactNode }) {
  return <span className="spec-tag mono">{children}</span>;
}

function ResumeBlock({ resumeUrl }: { resumeUrl: unknown }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const resolved = useResolvedUrl(
    "resumes",
    typeof resumeUrl === "string" && !isHttp(resumeUrl) ? resumeUrl : null,
  );

  if (!resumeUrl) return null;

  const http = isHttp(resumeUrl) ? (resumeUrl as string) : null;
  const did = http ? driveId(http) : null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Lazy-load: check sharing the moment HR opens the preview.
    if (next && did && status === null) {
      setStatus("Checking access…");
      try {
        const r = await fetch(`/api/resume-check?url=${encodeURIComponent(http as string)}`);
        const j = await r.json().catch(() => null);
        if (j?.status === "reachable") setStatus("Shared — preview below.");
        else if (j?.status === "restricted") setStatus(`Not accessible: ${j?.reason ?? "sharing is off"}. Ask the candidate to open Drive sharing.`);
        else setStatus("Could not verify access — try opening in a new tab.");
      } catch {
        setStatus("Could not verify access — try opening in a new tab.");
      }
    }
  }

  return (
    <div>
      {did ? (
        <>
          <button type="button" className="spec-btn" onClick={toggle} aria-expanded={open}>
            {open ? "Hide resume preview ▾" : "Preview resume ▸"}
          </button>
          {open ? (
            <div style={{ marginTop: 12 }}>
              {status ? <p className="spec-note" style={{ marginBottom: 8 }}>{status}</p> : null}
              <iframe
                title="Resume preview"
                src={`https://drive.google.com/file/d/${did}/preview`}
                className="resume-frame"
                loading="lazy"
                sandbox="allow-scripts allow-same-origin"
              />
              <p style={{ marginTop: 8 }}>
                <a className="spec-link" href={http as string} target="_blank" rel="noreferrer">
                  Open in Drive ↗
                </a>
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <a
          className="spec-btn"
          href={http ?? resolved ?? undefined}
          target={http ? "_blank" : undefined}
          rel="noreferrer"
        >
          Open resume ↗
        </a>
      )}
    </div>
  );
}

export default function Portfolio({
  bundle,
  mode,
  editHref,
  onContact,
  onShortlist,
  shortlisted,
  isOwner,
  calm,
  match,
}: {
  bundle: Bundle;
  mode: "public" | "hr";
  editHref?: string;
  onContact?: () => void;
  onShortlist?: () => void;
  shortlisted?: boolean;
  isOwner?: boolean;
  calm?: boolean;
  match?: MatchView;
}) {
  const c = bundle.candidate ?? {};
  const depths = bundle.depths ?? {};
  const name: string = c.full_name ?? "Candidate";
  const role: string = c.headline ?? c.current_position ?? "";
  const photo = useResolvedUrl("photos", c.photo_url);
  const portfolioFile = useResolvedUrl(
    "portfolios",
    typeof c.portfolio_url === "string" && !isHttp(c.portfolio_url) ? c.portfolio_url : null,
  );

  const [visibility, setVisibility] = useState<string>(c.visibility_status ?? "visible");
  const [openExp, setOpenExp] = useState<number | null>(null);
  const [visMsg, setVisMsg] = useState<string | null>(null);

  // Contact privacy: per-channel opt-in for everyone (deny-by-default).
  // The API already nulls non-opted channels; this is defense-in-depth so a
  // full bundle passed directly can never leak PII in either mode.
  const show = (flag: string, value: unknown) => c[flag] === true && !!value;

  const showEmail = show("show_email", c.contact_email);
  const showPhone = show("show_phone", c.contact_phone);
  const showLinkedin = show("show_linkedin", c.linkedin_url);
  const showGithub = show("show_github", c.github_url);
  const showResume = show("show_resume", c.resume_url);
  const portfolioHref =
    (isHttp(c.portfolio_url) ? (c.portfolio_url as string) : portfolioFile) ?? null;
  const showPortfolio = mode === "hr" ? !!portfolioHref : c.show_portfolio === true && !!portfolioHref;

  const skillItems: { name: string; level?: string | null; years?: number | null }[] = (
    bundle.skills ?? []
  ).flatMap((s) => {
    const n = s.skills;
    const names = (n ? (Array.isArray(n) ? n : [n]) : [])
      .map((x) => x?.name)
      .filter(Boolean) as string[];
    return names.map((nm) => ({
      name: nm,
      level: s.proficiency_level ?? null,
      years:
        typeof s.experience_years === "number" ? s.experience_years : null,
    }));
  });

  const summary = (bundle.profile?.summary_markdown || "").trim();
  const expTotal =
    typeof c.total_experience_years === "number" ? c.total_experience_years : null;

  const views = bundle.contact_log ?? [];
  const matches = bundle.matches ?? [];

  const projects = bundle.projects ?? [];
  const experiences = bundle.experiences ?? [];
  const education = bundle.education ?? [];
  const oss = bundle.oss ?? [];

  // Telemetry strip — quick numeric scan of the profile's substance.
  const stats = [
    expTotal !== null ? { v: `${expTotal} yrs`, l: "Experience" } : null,
    skillItems.length ? { v: String(skillItems.length), l: "Skills" } : null,
    projects.length ? { v: String(projects.length), l: "Builds" } : null,
    oss.length ? { v: String(oss.length), l: "OSS PRs" } : null,
    education.length ? { v: String(education.length), l: "Education" } : null,
    experiences.length ? { v: String(experiences.length), l: "Roles" } : null,
  ].filter(Boolean) as { v: string; l: string }[];

  // Hero eyebrow: availability + location, like the reference's emerald badge.
  const availability = availLabel(c.availability_status);
  const heroMeta = [c.location_city, c.domain].filter(Boolean).join(" · ");

  async function setVis(v: string) {
    setVisMsg("Saving…");
    try {
      const r = await fetch("/api/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, visibility_status: v }),
      });
      if (!r.ok) {
        setVisMsg("Save failed.");
        return;
      }
      setVisibility(v);
      setVisMsg("Visibility updated.");
    } catch {
      setVisMsg("Save failed.");
    }
  }

  return (
    <div className="portfolio spec-page">
      <motion.div
        initial={calm ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* ── Spec header: brand box + name + role badge ── */}
        <header className="spec-header">
          <div className="spec-header-id">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={name} className="spec-portrait" />
            ) : (
              <span className="spec-brandbox" aria-hidden="true">{initials(name)}</span>
            )}
            <span className="spec-header-name">{name}</span>
            {expTotal !== null ? (
              <span className="spec-chip mono">{expTotal}y · {c.domain ?? "Engineer"}</span>
            ) : c.domain ? (
              <span className="spec-chip mono">{c.domain}</span>
            ) : null}
          </div>
          <div className="spec-header-actions">
            {mode === "public" && isOwner && editHref ? (
              <a className="spec-btn spec-btn-sm" href={editHref} title="Edit your details">
                Edit profile
              </a>
            ) : null}
            {mode === "hr" && onShortlist ? (
              <button type="button" className="spec-btn spec-btn-sm" onClick={onShortlist}>
                {shortlisted ? "★ Shortlisted" : "☆ Shortlist"}
              </button>
            ) : null}
            {mode === "hr" && onContact ? (
              <button type="button" className="spec-btn spec-btn-sm spec-btn-primary" onClick={onContact}>
                Send message ↗
              </button>
            ) : showEmail ? (
              <a className="spec-btn spec-btn-sm spec-btn-primary" href={`mailto:${c.contact_email}`}>
                Send message ↗
              </a>
            ) : null}
          </div>
        </header>

        {/* ── Hero: title, summary-style role, CLI pill + contact ── */}
        <section className="spec-hero">
          <div className="spec-hero-main">
            {availability || heroMeta ? (
              <div className="spec-hero-eyebrow">
                <StatusBadge>
                  {availability ?? "Building in public"}
                  {heroMeta ? ` · ${heroMeta}` : ""}
                </StatusBadge>
              </div>
            ) : null}
            <h1 className="spec-hero-title">{role || name}</h1>
            {role && role !== name ? (
              <p className="spec-hero-desc">{name} — candidate dossier on Tammy.</p>
            ) : null}
            <div className="spec-hero-ctas">
              <CopyPill value={`npx hire ${name.toLowerCase().replace(/\s+/g, "-")}`} />
              {showEmail ? (
                <a className="spec-btn spec-btn-primary" href={`mailto:${c.contact_email}`}>
                  Contact candidate
                </a>
              ) : null}
              {showPhone ? (
                <a className="spec-btn" href={`tel:${c.contact_phone}`}>{c.contact_phone}</a>
              ) : null}
            </div>
            {/* HR-only: salary expectations never leak publicly. */}
            {mode === "hr" && typeof c.min_salary === "number" && c.min_salary > 0 ? (
              <p className="spec-hero-salary mono">
                Expecting {Number(c.min_salary).toLocaleString()} {c.salary_currency ?? ""}/{c.salary_frequency ?? "monthly"} · {c.current_position ?? role}
              </p>
            ) : null}
          </div>
        </section>

        {/* ── Telemetry strip ── */}
        {stats.length ? (
          <div className="spec-stats" role="list">
            {stats.map((s) => (
              <div className="spec-stat" role="listitem" key={s.l}>
                <span className="spec-stat-val mono">{s.v}</span>
                <span className="spec-stat-lbl">{s.l}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* ── SELECTED WORK — spec-sheet project cards ── */}
        {projects.length ? (
          <section className="spec-section">
            <Eyebrow sub={`${projects.length} ${projects.length === 1 ? "build" : "builds"}`}>Selected builds</Eyebrow>
            <div className="spec-projects">
              {projects.map((p, i) => {
                const d = depths[String(p.id)] ?? {};
                const tech = ((p.tech_stack ?? []) as string[]);
                const impact = impactParts(p.impact_summary);
                const complexity =
                  typeof d.complexity_score === "number" ? d.complexity_score : null;
                return (
                  <motion.article
                    key={String(p.id ?? p.title) + i}
                    className="spec-project"
                    initial={calm ? false : { opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: (i % 2) * 0.07 }}
                  >
                    <div className="spec-project-top">
                      <span className="mono">{(p.project_type ?? "BUILD").toUpperCase()}</span>
                      {complexity !== null ? (
                        <span className="spec-complex mono" title="AI-estimated complexity">
                          {complexity < 4 ? "moderate" : complexity < 7.5 ? "complex" : "high-complex"}
                        </span>
                      ) : null}
                    </div>
                    <div className="spec-project-body">
                      <h3>{p.title}</h3>
                      {p.description ? <p>{p.description}</p> : null}
                      <div className="spec-project-specs">
                        {p.problem_statement ? (
                          <div className="spec-line">
                            <span className="spec-key mono">Problem</span>
                            <span>{p.problem_statement}</span>
                          </div>
                        ) : null}
                        {impact.length ? (
                          <div className="spec-line">
                            <span className="spec-key mono">Impact</span>
                            <span>{impact[0]}</span>
                          </div>
                        ) : null}
                        {p.role_in_project ? (
                          <div className="spec-line">
                            <span className="spec-key mono">Role</span>
                            <span>{p.role_in_project}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="spec-project-foot">
                        {tech.length ? (
                          <div className="spec-tags">
                            {tech.slice(0, 6).map((t) => (
                              <SpecTag key={t}>{t}</SpecTag>
                            ))}
                          </div>
                        ) : <span />}
                        <div className="spec-links mono">
                          {p.project_link ? <a href={p.project_link} target="_blank" rel="noreferrer">Live ↗</a> : null}
                          {p.repo_link ? <a href={p.repo_link} target="_blank" rel="noreferrer">Repo ↗</a> : null}
                          {p.deployment_link && p.deployment_link !== p.project_link ? <a href={p.deployment_link} target="_blank" rel="noreferrer">Demo ↗</a> : null}
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── EXPERIENCE — trajectory rail ── */}
        {experiences.length ? (
          <section className="spec-section">
            <Eyebrow sub={`${experiences.length} ${experiences.length === 1 ? "role" : "roles"}`}>Career trajectory</Eyebrow>
            <div className="spec-rail">
              {experiences.map((e, i) => {
                const open = openExp === i;
                const bullets = impactParts(e.achievements ?? e.description);
                return (
                  <div className="spec-rail-item" key={(e.company_name ?? "") + i}>
                    <div className="spec-rail-head">
                      <span className="spec-rail-date mono">{yearRange(e.start_date, e.end_date, e.is_current)}</span>
                      <div>
                        <div className="spec-rail-company">
                          {e.job_title ?? "Role"}{e.company_name ? ` · ${e.company_name}` : ""}
                        </div>
                        {bullets.length || e.description ? (
                          <button
                            type="button"
                            className="spec-rail-toggle"
                            onClick={() => setOpenExp(open ? null : i)}
                            aria-expanded={open}
                          >
                            {open ? "Hide details ▾" : "Details ▸"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {open ? (
                      <div className="spec-rail-body">
                        {bullets.length ? (
                          <ul className="spec-rail-bullets">
                            {bullets.map((b, j) => (
                              <li key={j}>{b}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>{e.description}</p>
                        )}
                        {((e.tech_stack ?? []) as string[]).length ? (
                          <div className="spec-tags" style={{ marginTop: 10 }}>
                            {((e.tech_stack ?? []) as string[]).slice(0, 8).map((t) => (
                              <SpecTag key={t}>{t}</SpecTag>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── OPEN SOURCE ── */}
        {oss.length ? (
          <section className="spec-section">
            <Eyebrow sub={`${oss.length} contributions`}>Open source</Eyebrow>
            <div className="spec-rail">
              {oss.map((o, i) => (
                <div className="spec-rail-item" key={String(o.id ?? o.repo_name) + i}>
                  <div className="spec-rail-head">
                    <span className="spec-rail-date mono">{o.role || "Contributor"}</span>
                    <div>
                      <div className="spec-rail-company">{o.repo_name}</div>
                      {o.description ? <p className="spec-rail-note">{o.description}</p> : null}
                    </div>
                  </div>
                  {((o.tech_stack ?? []) as string[]).length || o.repo_url || ((o.pr_links ?? []) as string[]).length ? (
                    <div className="spec-rail-body" style={{ marginTop: 8 }}>
                      {((o.tech_stack ?? []) as string[]).length ? (
                        <div className="spec-tags" style={{ marginBottom: 10 }}>
                          {((o.tech_stack ?? []) as string[]).map((t) => (
                            <SpecTag key={t}>{t}</SpecTag>
                          ))}
                        </div>
                      ) : null}
                      <div className="spec-links mono">
                        {o.repo_url ? <a href={o.repo_url} target="_blank" rel="noreferrer">Repo ↗</a> : null}
                        {((o.pr_links ?? []) as string[]).map((u, j) => (
                          <a key={u + j} href={u} target="_blank" rel="noreferrer">
                            PR #{(() => {
                              const m = String(u).match(/\/pull\/(\d+)/);
                              return m ? m[1] : j + 1;
                            })()} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── SKILLS ── */}
        {skillItems.length ? (
          <section className="spec-section">
            <Eyebrow sub={`${skillItems.length}`}>Skills</Eyebrow>
            <div className="spec-tags">
              {skillItems.map((s) => (
                <span className="spec-tag mono" key={s.name} title={s.level ?? undefined}>
                  {s.name}
                  {s.years !== null ? <em>{s.years}y</em> : s.level ? <em>{s.level}</em> : null}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── RESUME (only when opted in / HR) ── */}
        {showResume ? (
          <section className="spec-section">
            <Eyebrow>Resume</Eyebrow>
            <ResumeBlock resumeUrl={c.resume_url} />
          </section>
        ) : null}

        {/* ── EDUCATION ── */}
        {education.length ? (
          <section className="spec-section">
            <Eyebrow>Education</Eyebrow>
            <div className="spec-rail">
              {education.map((e, i) => (
                <div className="spec-rail-item" key={(e.institution ?? "") + i}>
                  <div className="spec-rail-head">
                    <span className="spec-rail-date mono">
                      {[e.start_year, e.end_year].filter(Boolean).join(" — ") || "—"}
                    </span>
                    <div>
                      <div className="spec-rail-company">{e.institution}</div>
                      <p className="spec-rail-note">
                        {[e.degree, e.field_of_study].filter(Boolean).join(" · ")}
                      </p>
                      {e.achievements ? <p className="spec-rail-note">{e.achievements}</p> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── AI SUMMARY (HR only) ── */}
        {mode === "hr" ? (
          <section className="spec-section">
            <Eyebrow sub="evidence-checked">AI summary</Eyebrow>
            {summary ? (
              <Md text={summary} />
            ) : (
              <p className="spec-note">
                ⏳ Summary pending — the background pipeline (normalize →
                summary → depth → embed) hasn&apos;t finished for this profile
                yet. Everything above is live.
              </p>
            )}
          </section>
        ) : null}

        {/* ── MATCH VERDICT (HR only, from live search) ── */}
        {mode === "hr" && match ? (
          <section className="spec-section">
            <Eyebrow
              sub={
                match.match_level === "strong" ? "Strong match"
                : match.match_level === "partial" ? "Partial match"
                : match.match_level === "weak" ? "Emerging match"
                : "match"
              }
            >
              Why this candidate
            </Eyebrow>
            {match.sub_scores && Object.keys(match.sub_scores).length ? (
              <div className="spec-tags" style={{ marginBottom: 12 }}>
                {Object.entries(match.sub_scores).map(([k, v]) => (
                  <span className="spec-tag mono" key={k} title={`${k} fit signal`}>
                    {k} · {typeof v === "number" ? (v >= 0.7 ? "strong" : v >= 0.4 ? "mixed" : "weak") : String(v)}
                  </span>
                ))}
              </div>
            ) : null}
            {match.judge?.recommendation ? <p style={{ marginBottom: 10 }}>{match.judge.recommendation}</p> : null}
            {match.judge?.strengths?.length ? (
              <div className="spec-line">
                <span className="spec-key mono">Strengths</span>
                <span>{match.judge.strengths.join(" · ")}</span>
              </div>
            ) : null}
            {(match.judge?.gaps?.length || match.judge?.missing_requirements?.length) ? (
              <div className="spec-line">
                <span className="spec-key mono">Gaps</span>
                <span>{[...(match.judge.gaps ?? []), ...(match.judge.missing_requirements ?? [])].join(" · ")}</span>
              </div>
            ) : null}
            {match.judge?.risk_factors?.length ? (
              <div className="spec-line">
                <span className="spec-key mono">Risks</span>
                <span>{match.judge.risk_factors.join(" · ")}</span>
              </div>
            ) : null}
            {match.judge?.project_evidence?.length ? (
              <div className="spec-line">
                <span className="spec-key mono">Evidence</span>
                <span>{match.judge.project_evidence.join(" · ")}</span>
              </div>
            ) : null}
            {!match.judge ? (
              <p className="spec-note">
                Rule-ranked fit (semantic, skills, depth, constraints, seniority).
                {` `}Run Deep read to get the judge verdict with exhibits and interview questions.
              </p>
            ) : null}
          </section>
        ) : null}

        {/* ── SUGGESTED INTERVIEW QUESTIONS (HR only) ── */}
        {mode === "hr" && match?.judge?.interview_questions?.length ? (
          <section className="spec-section">
            <Eyebrow sub="next">Suggested interview questions</Eyebrow>
            <ul className="spec-rail-bullets">
              {match.judge.interview_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ── CONTACT ── */}
        <section className="spec-section">
          <Eyebrow sub={mode === "hr" ? "open-contact" : "opted-in channels"}>Contact</Eyebrow>
          <div className="spec-links" style={{ gap: 16 }}>
            {showEmail ? <a className="spec-contact-main" href={`mailto:${c.contact_email}`}>{c.contact_email} ↗</a> : null}
            {showPhone ? <a href={`tel:${c.contact_phone}`}>{c.contact_phone} ↗</a> : null}
            {showLinkedin ? <a href={c.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a> : null}
            {showGithub ? <a href={c.github_url} target="_blank" rel="noreferrer">GitHub ↗</a> : null}
            {showPortfolio && portfolioHref ? <a href={portfolioHref} target="_blank" rel="noreferrer">Portfolio ↗</a> : null}
            {!showEmail && !showPhone && !showLinkedin && !showGithub && !showPortfolio ? (
              <p className="spec-note">No public contact channels — reach the candidate via Tammy search.</p>
            ) : null}
          </div>
          {photo || portfolioFile ? (
            <div className="spec-links" style={{ marginTop: 10 }}>
              {photo ? <a href={photo} target="_blank" rel="noreferrer">Photo file ↗</a> : null}
              {portfolioFile ? <a href={portfolioFile} target="_blank" rel="noreferrer">Portfolio file ↗</a> : null}
            </div>
          ) : null}
        </section>

        {/* ── OWNER DASHBOARD (only you see this) ── */}
        {mode === "public" && isOwner ? (
          <section className="spec-section">
            <Eyebrow sub="only you see this">Owner dashboard</Eyebrow>
            <div className="spec-owner">
              <div className="rowline" style={{ flexWrap: "wrap" }}>
                <label style={{ fontSize: 12.5, fontWeight: 600 }}>
                  Visibility{" "}
                  <select
                    className="select"
                    style={{ width: "auto", display: "inline-block", marginLeft: 6 }}
                    value={visibility}
                    onChange={(e) => void setVis(e.target.value)}
                  >
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                {visMsg ? <span className="oknote">{visMsg}</span> : null}
              </div>
              <div className="spec-owner-stats">
                <span>
                  <strong className="mono">{views.length}</strong> contacts
                </span>
                <span>
                  <strong className="mono">{matches.length}</strong> matches
                </span>
              </div>
              {views.length ? (
                <div style={{ marginTop: 12 }}>
                  <p className="spec-note" style={{ marginBottom: 8 }}>
                    Who contacted me
                  </p>
                  {views.map((v, i) => (
                    <div className="spec-owner-row" key={String(v.id ?? i)}>
                      <strong>{v.channel ?? "contact"}</strong>
                      <p>{v.message ?? "—"}</p>
                      <span className="mono">{v.created_at ? new Date(v.created_at).toLocaleString() : ""}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="spec-note" style={{ marginTop: 12 }}>
                  No outreach yet — share your page or wait for HR searches to find you.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {/* ── FOOTER ── */}
        <footer className="spec-footer">
          <span className="mono">© {new Date().getFullYear()} {name}</span>
          <span className="mono">Via Tammy ↗</span>
        </footer>
      </motion.div>
    </div>
  );
}
