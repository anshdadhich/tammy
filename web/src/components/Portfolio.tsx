"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

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

function FrameButton({
  href,
  children,
  green,
  onClick,
}: {
  href?: string;
  children: React.ReactNode;
  green?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="h tl"></span>
      <span className="h tr"></span>
      <span className="h bl"></span>
      <span className="h br"></span>
      {children}
    </>
  );
  const cls = "btn-frame" + (green ? " btn-green" : "");
  if (href) {
    return (
      <a
        href={href}
        className={cls}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer"
      >
        {inner}
      </a>
    );
  }
  return (
    <button className={cls} onClick={onClick} type="button">
      {inner}
    </button>
  );
}

function ResumeBlock({ resumeUrl }: { resumeUrl: unknown }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const resolved = useResolvedUrl(
    "resumes",
    typeof resumeUrl === "string" && !isHttp(resumeUrl) ? resumeUrl : null,
  );

  if (!resumeUrl) return <p className="pf-bio">No resume on file.</p>;

  const http = isHttp(resumeUrl) ? (resumeUrl as string) : null;
  const did = http ? driveId(http) : null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Lazy-load: check sharing the moment HR opens the preview.
    if (next && did && status === null) {
      setStatus("Checking access…");
      try {
        const r = await fetch(`/api/drive-check?url=${encodeURIComponent(http as string)}`);
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
          <FrameButton onClick={toggle}>
            {open ? "Hide resume preview ▾" : "Preview resume ▸"}
          </FrameButton>
          {open ? (
            <div style={{ marginTop: 12 }}>
              {status ? <p className="pf-bio" style={{ marginBottom: 8 }}>{status}</p> : null}
              <iframe
                title="Resume preview"
                src={`https://drive.google.com/file/d/${did}/preview`}
                className="resume-frame"
              />
              <p style={{ marginTop: 8 }}>
                <a className="btn-plain" href={http as string} target="_blank" rel="noreferrer">
                  Open in Drive ↗
                </a>
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <FrameButton href={http ?? resolved ?? undefined}>
          Open resume ↗
        </FrameButton>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        Drive links preferred — uploads are a fallback.
      </p>
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
}: {
  bundle: Bundle;
  mode: "public" | "hr";
  editHref?: string;
  onContact?: () => void;
  onShortlist?: () => void;
  shortlisted?: boolean;
  isOwner?: boolean;
  calm?: boolean;
}) {
  const c = bundle.candidate ?? {};
  const depths = bundle.depths ?? {};
  const name: string = c.full_name ?? "Candidate";
  const role: string = c.headline ?? c.current_position ?? "";
  const photo = useResolvedUrl("photos", c.photo_url);
  const portfolioFile =
    typeof c.portfolio_url === "string" && !isHttp(c.portfolio_url)
      ? (useResolvedUrl("portfolios", c.portfolio_url) as string | null)
      : null;

  const [openExp, setOpenExp] = useState<number | null>(0);
  const [visibility, setVisibility] = useState<string>(c.visibility_status ?? "visible");
  const [visMsg, setVisMsg] = useState<string | null>(null);

  // Contact: open-contact — verified HR sees everything directly;
  // public visitors only see channels the candidate left switched on.
  const show = (flag: string, value: unknown) =>
    mode === "hr" ? !!value : c[flag] !== false && !!value;

  const showEmail = show("show_email", c.contact_email);
  const showPhone = show("show_phone", c.contact_phone);
  const showLinkedin = show("show_linkedin", c.linkedin_url);
  const showGithub = show("show_github", c.github_url);
  const showResume = show("show_resume", c.resume_url);
  const portfolioHref =
    (isHttp(c.portfolio_url) ? (c.portfolio_url as string) : portfolioFile) ?? null;
  const showPortfolio = mode === "hr" ? !!portfolioHref : c.show_portfolio !== false && !!portfolioHref;

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

  const chips = [
    c.domain ?? null,
    expTotal !== null ? `${expTotal} yrs exp` : null,
    c.location_city ?? null,
    availLabel(c.availability_status),
    c.visibility_status ? `● ${c.visibility_status}` : null,
  ].filter(Boolean) as string[];

  const salaryLine = [
    typeof c.min_salary === "number" && c.min_salary > 0
      ? `Min ${Number(c.min_salary).toLocaleString()} ${c.salary_currency ?? ""}/${c.salary_frequency ?? "monthly"}`
      : "Salary open",
    c.current_position ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  const views = bundle.contact_log ?? [];
  const matches = bundle.matches ?? [];

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
    <div className="portfolio">
      <motion.div
        initial={calm ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="pf-top">
          <span>{c.location_city ?? "Portfolio"}</span>
          <span className="pf-top-right">
            {mode === "public" && editHref ? (
              <a className="pf-edit" href={editHref} title="Edit your details">
                ✎ Edit
              </a>
            ) : null}
          </span>
        </div>

        {/* 1. HERO */}
        <motion.div
          className="pf-hero"
          initial={calm ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.05 }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <motion.img
              src={photo}
              alt={name}
              className="pf-photo"
              initial={calm ? false : { scale: 0.92 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            />
          ) : (
            <div className="pf-photo pf-photo-fallback">{initials(name)}</div>
          )}
          <div className="pf-side">
            <div className="pf-status">
              {availLabel(c.availability_status) ?? "Building in public."}
            </div>
            <div className="rowline" style={{ justifyContent: "flex-end" }}>
              {mode === "hr" && onShortlist ? (
                <FrameButton onClick={onShortlist}>
                  {shortlisted ? "★ Shortlisted" : "☆ Shortlist"}
                </FrameButton>
              ) : null}
              {mode === "hr" && onContact ? (
                <FrameButton green onClick={onContact}>
                  Send message&nbsp;↗
                </FrameButton>
              ) : showEmail ? (
                <FrameButton green href={`mailto:${c.contact_email}`}>
                  Send message&nbsp;↗
                </FrameButton>
              ) : null}
            </div>
          </div>
        </motion.div>

        <h1 className="pf-name">{name}</h1>
        {role ? <h2 className="pf-role">{role}</h2> : null}

        {chips.length ? (
          <div className="chiprow">
            {chips.map((chip) => (
              <span className="meta-chip" key={chip}>
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        <p className="salary-line">{salaryLine}</p>

        {/* 2. WORK EXPERIENCE */}
        {(bundle.experiences ?? []).length ? (
          <div className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-title">Work Experience</span>
              <span className="pf-sec-sub">
                {(() => {
                  const yrs = (bundle.experiences ?? [])
                    .map((e) => Number(String(e.start_date ?? "").slice(0, 4)) || 0)
                    .filter(Boolean);
                  return yrs.length ? `${Math.min(...yrs)} — Present` : "";
                })()}
              </span>
            </div>
            <div className="exp-list">
              {(bundle.experiences ?? []).map((e, i) => {
                const open = openExp === i;
                return (
                  <motion.div
                    className="acc"
                    key={(e.company_name ?? "") + i}
                    initial={calm ? false : { opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(i, 3) * 0.05 }}
                  >
                    <button
                      className="acc-head"
                      type="button"
                      onClick={() => setOpenExp(open ? null : i)}
                      aria-expanded={open}
                    >
                      <span className="exp-left">
                        <span className="exp-icon">{initials(e.company_name ?? "?")}</span>
                        <span className="exp-info">
                          <h3>{e.company_name}</h3>
                          <p>{e.job_title}</p>
                        </span>
                      </span>
                      <span className="exp-meta">
                        <span className="exp-date">
                          {yearRange(e.start_date, e.end_date, e.is_current)}
                        </span>
                        <span className="exp-role">{open ? "▾" : "▸"}</span>
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open ? (
                        <motion.div
                          key="body"
                          className="acc-collapse"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: "easeInOut" }}
                          style={{ overflow: "hidden" }}
                        >
                          <div className="acc-body">
                          {e.description ? <p className="pf-bio">{e.description}</p> : null}
                          {e.achievements ? (
                            <p className="pf-bio">
                              <strong>Achievements — </strong>
                              {e.achievements}
                            </p>
                          ) : null}
                          {((e.tech_stack ?? []) as string[]).length ? (
                            <div className="skillrow">
                              {((e.tech_stack ?? []) as string[]).map((t) => (
                                <span className="skilltag" key={t}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 3. PROJECTS */}
        {(bundle.projects ?? []).length ? (
          <div className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-title">Projects</span>
              <span className="pf-sec-sub">{(bundle.projects ?? []).length}</span>
            </div>
            <div className="proj-grid">
              {(bundle.projects ?? []).map((p, i) => {
                const d = depths[String(p.id)] ?? {};
                const badges = [
                  typeof d.complexity_score === "number" ? `Complexity ${d.complexity_score}/10` : null,
                  d.technical_complexity ?? null,
                  d.evidence_quality ? `${d.evidence_quality} evidence` : null,
                  d.autonomy_level && d.autonomy_level !== "unknown" ? d.autonomy_level : null,
                  d.estimated_seniority_signal && d.estimated_seniority_signal !== "unknown"
                    ? `${d.estimated_seniority_signal} signal`
                    : null,
                ].filter(Boolean) as string[];
                const concepts = ((d.architectural_concepts ?? []) as string[]);
                const impact = impactParts(p.impact_summary);
                return (
                  <motion.div
                    key={String(p.id ?? p.title) + i}
                    className="proj-card"
                    initial={calm ? false : { opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.45, ease: "easeOut", delay: (i % 2) * 0.08 }}
                    whileHover={{ y: -4 }}
                  >
                    <div className={`proj-thumb t${i % 3}`}>
                      <div className="proj-water">{p.title ?? "Project"}</div>
                      <div className="proj-tech">
                        {((p.tech_stack ?? []) as string[]).join(" · ") ||
                          p.project_type ||
                          "Project"}
                      </div>
                    </div>
                    <h4 className="proj-title">{p.title}</h4>
                    <p className="proj-meta">
                      {[p.project_type, p.role_in_project].filter(Boolean).join(" · ")}
                    </p>
                    <p className="proj-desc">{p.description}</p>
                    {p.problem_statement ? (
                      <p className="proj-desc">
                        <strong>Problem — </strong>
                        {p.problem_statement}
                      </p>
                    ) : null}
                    {impact.length ? (
                      <div className="impact-block">
                        <p className="proj-desc">
                          <strong>Impact — </strong>
                          {impact[0]}
                        </p>
                        {impact.slice(1).map((part, j) => (
                          <p className="proj-desc" key={j}>
                            {part}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {((p.tech_stack ?? []) as string[]).length ? (
                      <div className="skillrow">
                        {((p.tech_stack ?? []) as string[]).map((t) => (
                          <span className="skilltag" key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {badges.length || concepts.length ? (
                      <div className="depth-badges">
                        {badges.map((b) => (
                          <span className="dbadge" key={b}>
                            {b}
                          </span>
                        ))}
                        {concepts.map((t) => (
                          <span className="dbadge dim" key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="proj-meta" style={{ marginTop: 8 }}>
                        Depth analysis pending.
                      </p>
                    )}
                    {(p.project_link || p.repo_link || p.deployment_link) && (
                      <div className="proj-links">
                        {p.project_link ? <FrameButton href={p.project_link}>Live ↗</FrameButton> : null}
                        {p.repo_link ? <FrameButton href={p.repo_link}>Repo ↗</FrameButton> : null}
                        {p.deployment_link && p.deployment_link !== p.project_link ? (
                          <FrameButton href={p.deployment_link}>Demo ↗</FrameButton>
                        ) : null}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 4. OPEN SOURCE CONTRIBUTIONS */}
        {(bundle.oss ?? []).length ? (
          <div className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-title">Open Source</span>
              <span className="pf-sec-sub">{(bundle.oss ?? []).length} contributions</span>
            </div>
            <div className="exp-list">
              {(bundle.oss ?? []).map((o, i) => (
                <motion.div
                  className="acc"
                  key={String(o.id ?? o.repo_name) + i}
                  initial={calm ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: Math.min(i, 3) * 0.06 }}
                >
                  <div className="acc-head" style={{ cursor: "default" }}>
                    <span className="exp-left">
                      <span className="exp-icon">⌁</span>
                      <span className="exp-info">
                        <h3>{o.repo_name}</h3>
                        <p>{o.description || o.role || "Contributor"}</p>
                      </span>
                    </span>
                    <span className="exp-meta">
                      <span className="exp-role">{o.role || "Contributor"}</span>
                    </span>
                  </div>
                  <div className="acc-body" style={{ borderTop: "1px solid #f0f0f0" }}>
                    {((o.tech_stack ?? []) as string[]).length ? (
                      <div className="skillrow" style={{ marginBottom: 10 }}>
                        {((o.tech_stack ?? []) as string[]).map((t) => (
                          <span className="skilltag" key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="social-row" style={{ marginTop: 0 }}>
                      {o.repo_url ? <FrameButton href={o.repo_url}>Repo ↗</FrameButton> : null}
                      {((o.pr_links ?? []) as string[]).map((u, j) => (
                        <FrameButton key={u + j} href={u}>
                          PR #{(() => {
                            const m = String(u).match(/\/pull\/(\d+)/);
                            return m ? m[1] : j + 1;
                          })()} ↗
                        </FrameButton>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : null}

        {/* 5. SKILLS */}
        {skillItems.length ? (
          <div className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-title">Skills</span>
              <span className="pf-sec-sub">{skillItems.length}</span>
            </div>
            <div className="skillrow">
              {skillItems.map((s) => (
                <span className="skilltag" key={s.name} title={s.level ?? undefined}>
                  {s.name}
                  {s.level || s.years !== null ? (
                    <span className="skill-sub">
                      {[s.level, s.years !== null ? `${s.years}y` : null].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* 6. RESUME */}
        <div className="pf-sec">
          <div className="pf-sec-head">
            <span className="pf-sec-title">Resume</span>
          </div>
          <ResumeBlock resumeUrl={showResume ? c.resume_url : null} />
        </div>

        {/* 7. EDUCATION */}
        {(bundle.education ?? []).length ? (
          <div className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-title">Education</span>
            </div>
            {(bundle.education ?? []).map((e, i) => (
              <div className="edu-card" key={(e.institution ?? "") + i}>
                <h4>{e.institution}</h4>
                <p>
                  {[e.degree, e.field_of_study].filter(Boolean).join(" · ")}
                  {[e.start_year, e.end_year].filter(Boolean).length
                    ? ` (${[e.start_year, e.end_year].filter(Boolean).join(" – ")})`
                    : ""}
                </p>
                {e.achievements ? <p>{e.achievements}</p> : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* 8a. AI SUMMARY (HR only) */}
        {mode === "hr" ? (
          <div className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-title">AI summary</span>
              <span className="pf-sec-sub">evidence-checked</span>
            </div>
            {summary ? (
              <Md text={summary} />
            ) : (
              <p className="pf-bio">
                ⏳ Summary pending — the background pipeline (normalize →
                summary → depth → embed) hasn&apos;t finished for this profile
                yet. Skills, experience and projects below are live.
              </p>
            )}
          </div>
        ) : null}

        {/* 8b. CONTACT */}
        <div className="pf-sec">
          <div className="pf-sec-head">
            <span className="pf-sec-title">Contact</span>
            <span className="pf-sec-sub">
              {mode === "hr" ? "open-contact · visible to you directly" : "open-contact"}
            </span>
          </div>
          <div className="social-row" style={{ marginTop: 0 }}>
            {showEmail ? <FrameButton href={`mailto:${c.contact_email}`}>{c.contact_email}</FrameButton> : null}
            {showPhone ? <FrameButton href={`tel:${c.contact_phone}`}>{c.contact_phone}</FrameButton> : null}
            {showLinkedin ? <FrameButton href={c.linkedin_url}>LinkedIn</FrameButton> : null}
            {showGithub ? <FrameButton href={c.github_url}>GitHub</FrameButton> : null}
            {showPortfolio && portfolioHref ? <FrameButton href={portfolioHref}>Portfolio</FrameButton> : null}
            {!showEmail && !showPhone && !showLinkedin && !showGithub && !showPortfolio ? (
              <p className="pf-bio">No public contact channels.</p>
            ) : null}
          </div>
        </div>

        {/* 8c. FILES */}
        {(photo || portfolioFile) && (
          <div className="pf-sec">
            <div className="pf-sec-head">
              <span className="pf-sec-title">Files</span>
              <span className="pf-sec-sub">photo · portfolio</span>
            </div>
            <div className="social-row" style={{ marginTop: 0 }}>
              {photo ? <FrameButton href={photo}>Photo file</FrameButton> : null}
              {portfolioFile ? <FrameButton href={portfolioFile}>Portfolio file</FrameButton> : null}
            </div>
          </div>
        )}

        {/* 8d. OWNER */}
        {mode === "public" && isOwner ? (
          <div className="pf-sec">
            <div className="liquid-emerald-stage owner-head">
              <span>Owner dashboard</span>
              <span>only you see this</span>
            </div>
            <div className="owner-panel">
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
              <div className="owner-stats">
                <span>
                  <strong>{views.length}</strong> contacts
                </span>
                <span>
                  <strong>{matches.length}</strong> matches
                </span>
              </div>
              {views.length ? (
                <div style={{ marginTop: 12 }}>
                  <p className="pf-sec-sub" style={{ marginBottom: 8 }}>
                    Who contacted me
                  </p>
                  {views.map((v, i) => (
                    <div className="edu-card" key={String(v.id ?? i)}>
                      <h4>{v.channel ?? "contact"}</h4>
                      <p>{v.message ?? "—"}</p>
                      <p>{v.created_at ? new Date(v.created_at).toLocaleString() : ""}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pf-bio" style={{ marginTop: 12 }}>
                  No outreach yet — share your page or wait for HR searches to find you.
                </p>
              )}
            </div>
          </div>
        ) : null}

        <div className="pf-footer">
          <span>
            © {new Date().getFullYear()} {name}
          </span>
          <span>Via Tammy</span>
        </div>
      </motion.div>
    </div>
  );
}
