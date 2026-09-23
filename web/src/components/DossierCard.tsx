"use client";

import { useEffect, useState } from "react";
import type { Bundle, MatchView } from "./Portfolio";

function isHttp(u: unknown): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Storage paths need a signed URL; http links render directly.
function useFileUrl(bucket: "resumes" | "photos" | "portfolios", value: unknown): string | null {
  const [url, setUrl] = useState<string | null>(isHttp(value) ? (value as string) : null);
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

function availText(v: unknown, remote: unknown): string | null {
  const a =
    v === "immediate" ? "Available now"
    : v === "notice" ? "On notice"
    : v === "inactive" ? "Inactive"
    : typeof v === "string" && v ? v : null;
  const r =
    remote === "remote_only" ? "Remote"
    : remote === "hybrid" ? "Hybrid"
    : remote === "onsite" ? "Onsite"
    : remote === "flexible" ? "Flexible"
    : null;
  if (a && r) return `${a} · ${r}`;
  return a ?? r;
}

/**
 * HR dossier card: the landing mock, but real and detailed. Left rail
 * (identity, skills, availability) + right column (top projects, judge
 * verdict, interview questions), with score header and contact/resume
 * actions. The full Portfolio stays one click away via dossierHref.
 */
export default function DossierCard({
  bundle,
  match,
  shortlisted,
  dossierHref,
  onContact,
  onToggleShortlist,
}: {
  bundle: Bundle;
  match?: MatchView;
  shortlisted?: boolean;
  dossierHref?: string;
  onContact?: () => void;
  onToggleShortlist?: () => void;
}) {
  const c = bundle.candidate ?? {};
  const name: string = c.full_name ?? "Candidate";
  const role: string = c.headline ?? c.current_position ?? "";
  const domainLine = [c.domain, c.total_experience_years != null ? `${c.total_experience_years}y` : null, c.location_city]
    .filter(Boolean)
    .join(" · ");

  const skillNames: string[] = (bundle.skills ?? []).flatMap((s) => {
    const n = s.skills;
    const arr = n ? (Array.isArray(n) ? n : [n]) : [];
    return arr.map((x) => x?.name).filter(Boolean) as string[];
  });
  const skills = [...new Set(skillNames)].slice(0, 8);
  const availability = availText(c.availability_status, c.remote_preference);

  const projects = (bundle.projects ?? []).slice(0, 2);
  const photo = useFileUrl("photos", c.photo_url);
  const resumeHref = useFileUrl("resumes", c.resume_url);

  const levelWords =
    match?.match_level === "strong" ? "Strong match"
    : match?.match_level === "partial" ? "Partial match"
    : match?.match_level === "weak" ? "Emerging match"
    : null;
  const word01 = (s: number | null): string =>
    s === null ? "unknown" : s >= 0.7 ? "strong" : s >= 0.4 ? "mixed" : "weak";
  const word25 = (s: number | null): string =>
    s === null ? "unknown" : s >= 18 ? "strong" : s >= 10 ? "mixed" : "weak";
  const judge = match?.judge ?? null;
  const questions = judge?.interview_questions ?? [];
  const raw = (judge?.raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // Judge dimension scores (each 0–25) come through on raw; fall back to total.
  const dims = [
    { k: "Technical depth", v: num(raw.technical_depth_score) },
    { k: "Relevance", v: num(raw.relevance_score) },
    { k: "Impact", v: num(raw.impact_score) },
    { k: "No red flags", v: num(raw.red_flags_score) },
  ].filter((d) => d.v !== null) as { k: string; v: number }[];
  const bestProject = typeof raw.best_project_match === "string" && raw.best_project_match ? raw.best_project_match : null;
  const depths = bundle.depths ?? {};
  const experiences = bundle.experiences ?? [];
  const education = bundle.education ?? [];
  const oss = bundle.oss ?? [];
  const summary = (bundle.profile?.summary_markdown || "").trim();

  // Evaluation checklist: the exact questions the judge LLM answers for every
  // candidate (rubric: depth / relevance / impact / red-flags, each 0–25),
  // paired with this candidate's answers derived from the verdict + evidence.
  type Check = { q: string; a: string; v: "strong" | "partial" | "gap" | "unknown" };
  const tri = (s: number | null): Check["v"] =>
    s === null ? "unknown" : s >= 18 ? "strong" : s >= 10 ? "partial" : "gap";
  const tri01 = (s: number | null): Check["v"] =>
    s === null ? "unknown" : s >= 0.7 ? "strong" : s >= 0.4 ? "partial" : "gap";
  const sub = (match?.sub_scores ?? {}) as Record<string, number>;
  const subNum = (k: string): number | null =>
    typeof sub[k] === "number" ? sub[k] : null;
  const depthVals = Object.values(depths) as Record<string, unknown>[];
  const avgComplexity = depthVals.length
    ? depthVals.reduce((a, d) => a + (typeof d.complexity_score === "number" ? d.complexity_score : 5), 0) / depthVals.length
    : null;
  const evidenceModes = depthVals.map((d) => String(d.evidence_quality ?? "")).filter(Boolean);
  const topEvidence = evidenceModes.includes("strong") ? "strong" : evidenceModes.includes("moderate") ? "moderate" : evidenceModes.includes("weak") ? "weak" : null;
  const hasRepo = (bundle.projects ?? []).some((p) => p.repo_link || p.project_link || p.deployment_link);
  const checks: Check[] = [
    {
      q: "Do their past problems map to this role's actual problems?",
      a: (() => {
        const s = num(raw.relevance_score);
        const m = judge?.matched_requirements?.length ?? 0;
        const miss = judge?.missing_requirements?.length ?? 0;
        if (s === null && !judge) return "No judge verdict yet — run Deep read. Rule skill signal stands in below.";
        const bits: string[] = [];
        if (s !== null) bits.push(`${word25(s)} relevance`);
        if (m || miss) bits.push(`matched ${m}, missing ${miss}`);
        if (judge?.missing_requirements?.length) bits.push(`missing: ${judge.missing_requirements.slice(0, 3).join(", ")}`);
        return bits.join(" · ") || "No relevance signals recorded.";
      })(),
      v: judge ? tri(num(raw.relevance_score)) : tri01(subNum("skill")),
    },
    {
      q: "Hard problems (caching, concurrency, state, design) — or mostly CRUD?",
      a: (() => {
        const s = num(raw.technical_depth_score);
        const bits: string[] = [];
        if (s !== null) bits.push(`${word25(s)} depth`);
        if (avgComplexity !== null) bits.push(`${avgComplexity >= 7 ? "high" : avgComplexity >= 4 ? "moderate" : "light"} complexity across ${depthVals.length} project${depthVals.length === 1 ? "" : "s"}`);
        if (topEvidence) bits.push(`${topEvidence} evidence`);
        if (!bits.length) return "No depth signals yet — the background pipeline may still be running.";
        return bits.join(" · ");
      })(),
      v: judge ? tri(num(raw.technical_depth_score)) : avgComplexity !== null ? (avgComplexity >= 7 ? "strong" : avgComplexity >= 4 ? "partial" : "gap") : tri01(subNum("depth")),
    },
    {
      q: "Did they own outcomes with metrics — or assist?",
      a: (() => {
        const s = num(raw.impact_score);
        if (s === null && !judge) return "No judge verdict yet — run Deep read.";
        const bits: string[] = [];
        if (s !== null) bits.push(`${word25(s)} ownership signal`);
        if (judge?.project_evidence?.length) bits.push(judge.project_evidence.slice(0, 2).join(" · "));
        else if (bestProject) bits.push(bestProject);
        return bits.join(" — ") || "No impact evidence recorded.";
      })(),
      v: tri(num(raw.impact_score)),
    },
    {
      q: "Any red flags — tutorial clones, buzzword lists, role-complexity mismatch?",
      a: (() => {
        const s = num(raw.red_flags_score);
        if (s === null && !judge) return "No judge verdict yet — run Deep read.";
        if (s !== null && s >= 18 && !(judge?.risk_factors?.length)) return "Clean, nothing flagged.";
        const bits: string[] = [];
        if (s !== null) bits.push(`flag review: ${word25(s)}`);
        if (judge?.risk_factors?.length) bits.push(judge.risk_factors.join(" · "));
        if (judge?.gaps?.length) bits.push(judge.gaps.join(" · "));
        return bits.join(" — ") || "Nothing flagged.";
      })(),
      v: judge ? (num(raw.red_flags_score) !== null && num(raw.red_flags_score)! < 10 ? "gap" : tri(num(raw.red_flags_score))) : "unknown",
    },
    {
      q: "Is the evidence verifiable — repos, live demos, metrics?",
      a: hasRepo
        ? `Yes — ${topEvidence ? `evidence quality ${topEvidence}` : "linked artifacts"} on ${projects.length || "listed"} project${projects.length === 1 ? "" : "s"}.`
        : topEvidence
          ? `Partially — evidence quality ${topEvidence}, but no repo/live links attached. Ask for them.`
          : "No — no repos, demos, or metrics attached. Treat claims as unverified.",
      v: hasRepo ? (topEvidence === "weak" ? "partial" : "strong") : topEvidence ? "partial" : "gap",
    },
    {
      q: "Can we pay and place them — salary, location, seniority?",
      a: (() => {
        const bits: string[] = [];
        const cs = subNum("constraints");
        const ss = subNum("seniority");
        if (cs !== null) bits.push(`constraints ${word01(cs)}`);
        if (ss !== null) bits.push(`seniority ${word01(ss)}`);
        if (availability) bits.push(availability);
        return bits.length ? bits.join(" · ") : "No constraint signals for this search.";
      })(),
      v: (() => {
        const cs = subNum("constraints");
        const ss = subNum("seniority");
        const vals = [cs, ss].filter((x): x is number => x !== null);
        if (!vals.length) return "unknown";
        const worst = Math.min(...vals);
        return tri01(worst);
      })(),
    },
  ];
  const salary =
    typeof c.min_salary === "number" && c.min_salary > 0
      ? `${Number(c.min_salary).toLocaleString()} ${c.salary_currency ?? ""}/${c.salary_frequency ?? "monthly"}`
      : null;
  // Backfill salary into the checklist answer (declared above its use).
  const payCheck = checks[5];
  if (payCheck && salary && !payCheck.a.includes("expects")) {
    payCheck.a = payCheck.a === "No constraint signals for this search." ? `expects ${salary}` : `${payCheck.a} · expects ${salary}`;
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden card-shadow">
      {/* Score + actions header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50"><span className="text-sm font-bold">
          {levelWords ?? "Dossier"}
        </span>
        <span className="rowline">
          {onToggleShortlist ? (
            <button type="button" className="btn-plain" onClick={onToggleShortlist}>
              {shortlisted ? "★ Shortlisted" : "☆ Shortlist"}
            </button>
          ) : null}
          {dossierHref ? (
            <a className="btn-plain" href={dossierHref} target="_blank" rel="noreferrer">
              Full dossier ↗
            </a>
          ) : null}
          {onContact ? (
            <button type="button" className="btn-frame btn-green" onClick={onContact}>
              <span className="h tl"></span>
              <span className="h tr"></span>
              <span className="h bl"></span>
              <span className="h br"></span>
              Contact ↗
            </button>
          ) : null}
        </span>
      </div>

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left rail: identity */}
        <div className="p-6 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 min-w-0">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={name} className="w-10 h-10 rounded-full object-cover shadow-sm mb-3" loading="lazy" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-[#1F2DE6] text-white font-bold text-sm flex items-center justify-center mb-3 shadow-sm">
              {initials(name)}
            </div>
          )}
          <div className="text-base font-bold">{name}</div>
          {role ? <div className="text-xs text-slate-600 mt-0.5">{role}</div> : null}
          {domainLine ? <div className="text-xs text-slate-500 mt-0.5">{domainLine}</div> : null}

          {skills.length ? (
            <div className="flex flex-wrap gap-1.5 mt-5">
              {skills.map((s) => (
                <span
                  key={s}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : null}

          {salary ? (
            <div className="mt-5 pt-4 border-t border-slate-200">
              <div className="text-[10px] font-mono text-slate-400">EXPECTING</div>
              <div className="text-xs font-semibold mt-1">{salary}</div>
            </div>
          ) : null}

          <div className="mt-5 pt-4 border-t border-slate-200">
            <div className="text-[10px] font-mono text-slate-400">AVAILABILITY</div>
            <div className="text-xs font-semibold mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {availability ?? "—"}
            </div>
          </div>

          {/* Contact channels */}
          <div className="mt-5 pt-4 border-t border-slate-200 space-y-1.5">
            <div className="text-[10px] font-mono text-slate-400">CONTACT</div>
            {c.contact_email ? (
              <div className="break-all"><a className="text-xs font-semibold text-[#1F2DE6]" href={`mailto:${c.contact_email}`}>{c.contact_email}</a></div>
            ) : null}
            {c.contact_phone ? (
              <div><a className="text-xs font-semibold" href={`tel:${c.contact_phone}`}>{c.contact_phone}</a></div>
            ) : null}
            {c.linkedin_url ? (
              <div><a className="text-xs" href={c.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a></div>
            ) : null}
            {c.github_url ? (
              <div><a className="text-xs" href={c.github_url} target="_blank" rel="noreferrer">GitHub ↗</a></div>
            ) : null}
            {!c.contact_email && !c.contact_phone && !c.linkedin_url && !c.github_url ? (
              <div className="text-xs text-slate-500">No open channels — message via Tammy.</div>
            ) : null}
          </div>
        </div>

        {/* Right column: evidence */}
        <div className="p-6 space-y-3 min-w-0">
          {projects.length ? (
            projects.map((p) => (
              <div key={String(p.id ?? p.title)} className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold">{p.title}</span>
                  <span className="text-[10px] font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                    PROJECT
                    {(() => {
                      const d = depths[String(p.id)] ?? {};
                      const ev = typeof d.evidence_quality === "string" ? ` · ${d.evidence_quality} evidence` : "";
                      return ev;
                    })()}
                  </span>
                </div>
                {p.description ? (
                  <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>
                ) : null}
                {p.problem_statement ? (
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    <strong>Problem:</strong> {p.problem_statement}
                  </p>
                ) : null}
                {typeof p.impact_summary === "string" && p.impact_summary ? (
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    <strong>Impact:</strong> {p.impact_summary}
                  </p>
                ) : null}
                {p.role_in_project ? (
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    <strong>Role:</strong> {p.role_in_project}
                  </p>
                ) : null}
                {(() => {
                  const d = depths[String(p.id)] ?? {};
                  const bits = [
                    d.technical_complexity ? `complexity ${d.technical_complexity}` : null,
                    d.autonomy_level ? `autonomy ${d.autonomy_level}` : null,
                    d.estimated_seniority_signal ? `seniority ${d.estimated_seniority_signal}` : null,
                  ].filter(Boolean);
                  return bits.length ? (
                    <p className="font-mono text-[10px] text-slate-500 mt-2">AI depth · {bits.join(" · ")}</p>
                  ) : null;
                })()}
                {((p.tech_stack ?? []) as string[]).length ? (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {((p.tech_stack ?? []) as string[]).slice(0, 5).map((t) => (
                      <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
                {p.project_link || p.repo_link ? (
                  <div className="flex gap-3 mt-3 font-mono text-[11px]">
                    {p.project_link ? <a className="text-[#1F2DE6]" href={p.project_link} target="_blank" rel="noreferrer">Live ↗</a> : null}
                    {p.repo_link ? <a className="text-[#1F2DE6]" href={p.repo_link} target="_blank" rel="noreferrer">Repo ↗</a> : null}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="border border-slate-200 rounded-md p-4 bg-white">
              <p className="text-xs text-slate-600 leading-relaxed">No projects listed on this profile yet.</p>
            </div>
          )}

          <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold">Why this candidate</span>
              <span className="text-[10px] font-mono font-bold text-[#1F2DE6] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                {judge ? "JUDGE" : "FIT"}
              </span>
            </div>
            {judge?.recommendation ? (
              <p className="text-xs text-slate-600 leading-relaxed">{judge.recommendation}</p>
            ) : match?.sub_scores ? (
              <p className="text-xs text-slate-600 leading-relaxed">
                {Object.entries(match.sub_scores)
                  .map(([k, v]) => `${k} ${typeof v === "number" ? word01(v) : v}`)
                  .join(" · ")}
              </p>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                Ranked by evidence depth across this search. Run Deep read for a judge verdict.
              </p>
            )}
            {judge?.strengths?.length ? (
              <p className="text-xs text-slate-600 leading-relaxed mt-2">
                <strong>Strengths:</strong> {judge.strengths.join(" · ")}
              </p>
            ) : null}
            {(judge?.gaps?.length || judge?.missing_requirements?.length) ? (
              <p className="text-xs text-slate-600 leading-relaxed mt-1">
                <strong>Gaps:</strong> {[...(judge?.gaps ?? []), ...(judge?.missing_requirements ?? [])].join(" · ")}
              </p>
            ) : null}
            {judge?.risk_factors?.length ? (
              <p className="text-xs text-slate-600 leading-relaxed mt-1">
                <strong>Risks:</strong> {judge.risk_factors.join(" · ")}
              </p>
            ) : null}
            {judge?.project_evidence?.length ? (
              <p className="text-xs text-slate-600 leading-relaxed mt-1">
                <strong>Evidence:</strong> {judge.project_evidence.join(" · ")}
              </p>
            ) : null}
            {bestProject ? (
              <p className="text-xs text-slate-600 leading-relaxed mt-1">
                <strong>Best project match:</strong> {bestProject}
              </p>
            ) : null}
          </div>

          {dims.length || judge?.matched_requirements?.length || judge?.missing_requirements?.length ? (
            <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold">Judge breakdown</span>
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  DIMENSIONS
                </span>
              </div>
              {dims.length ? (
                <div className="space-y-1.5 mb-2">
                  {dims.map((d) => (
                    <div key={d.k} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500 w-28">{d.k}</span>
                      <span className="flex-1 h-1.5 rounded bg-slate-100 overflow-hidden">
                        <span
                          className="block h-full rounded bg-[#1F2DE6]"
                          style={{ width: `${Math.min(100, Math.round((d.v / 25) * 100))}%` }}
                        />
                      </span>
                      <span className="font-mono text-[10px] text-slate-600 w-14 text-right">{word25(d.v)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {judge?.matched_requirements?.length ? (
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  <strong>Matched:</strong> {judge.matched_requirements.join(" · ")}
                </p>
              ) : null}
              {judge?.missing_requirements?.length ? (
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  <strong>Missing:</strong> {judge.missing_requirements.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold">Evaluation checklist</span>
              <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                Q &amp; A
              </span>
            </div>
            <div className="space-y-3">
              {!judge ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Shallow search verdict below — run <strong>Deep read</strong> for the judge&apos;s
                  relevance, depth, ownership, and red-flag answers with exhibits.
                </p>
              ) : null}
              {(judge ? checks : checks.slice(4)).map((c) => (
                <div key={c.q}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-bold">{c.q}</span>
                    <span
                      className={
                        "text-[10px] font-mono font-bold px-2 py-0.5 rounded border " +
                        (c.v === "strong"
                          ? "text-green-700 bg-green-50 border-green-200"
                          : c.v === "partial"
                            ? "text-orange-700 bg-orange-50 border-orange-200"
                            : c.v === "gap"
                              ? "text-red-700 bg-red-50 border-red-200"
                              : "text-slate-500 bg-slate-100 border-slate-200")
                      }
                    >
                      {c.v === "strong" ? "STRONG" : c.v === "partial" ? "PARTIAL" : c.v === "gap" ? "GAP" : "UNKNOWN"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{c.a}</p>
                </div>
              ))}
            </div>
          </div>

          {summary ? (
            <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold">AI summary</span>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  PIPELINE
                </span>
              </div>
              {summary.split("\n").map((line, i) => {
                const t = line.trim();
                if (!t) return null;
                const h = t.match(/^#{1,4}\s+(.*)/);
                if (h) return <h4 key={i} className="text-xs font-bold mt-2 first:mt-0">{h[1]}</h4>;
                const b = t.match(/^[-*]\s+(.*)/);
                if (b) return <p key={i} className="text-xs text-slate-600 leading-relaxed">· {b[1]}</p>;
                return <p key={i} className="text-xs text-slate-600 leading-relaxed">{t.replace(/\*\*(.+?)\*\*/g, "$1")}</p>;
              })}
            </div>
          ) : null}

          {experiences.length ? (
            <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold">Career trajectory</span>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {experiences.length} {experiences.length === 1 ? "ROLE" : "ROLES"}
                </span>
              </div>
              <div className="space-y-2">
                {experiences.slice(0, 4).map((e, i) => (
                  <div key={i}>
                    <div className="text-xs font-bold">
                      {e.job_title ?? "Role"}{e.company_name ? ` · ${e.company_name}` : ""}
                    </div>
                    {e.description ? (
                      <p className="text-xs text-slate-600 leading-relaxed">{String(e.description).slice(0, 280)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {education.length || oss.length ? (
            <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold">Background</span>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  CREDENTIALS
                </span>
              </div>
              {education.slice(0, 3).map((e, i) => (
                <p key={i} className="text-xs text-slate-600 leading-relaxed">
                  <strong>{e.institution}</strong>
                  {[e.degree, e.field_of_study].filter(Boolean).length
                    ? ` · ${[e.degree, e.field_of_study].filter(Boolean).join(" · ")}`
                    : ""}
                </p>
              ))}
              {oss.slice(0, 3).map((o, i) => (
                <p key={`o${i}`} className="text-xs text-slate-600 leading-relaxed">
                  <strong>OSS:</strong> {o.repo_name}
                  {o.description ? ` — ${String(o.description).slice(0, 160)}` : ""}
                </p>
              ))}
            </div>
          ) : null}

          <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold">Suggested interview questions</span>
              <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                NEXT
              </span>
            </div>
            {questions.length ? (
              <ul className="text-xs text-slate-600 leading-relaxed space-y-1">
                {questions.map((q, i) => (
                  <li key={i}>· {q}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                Run Deep read on this candidate to get calibrated questions from the judge.
              </p>
            )}
          </div>

          {resumeHref ? (
            <div className="flex flex-wrap gap-2">
              <a className="btn-frame" href={resumeHref} target="_blank" rel="noreferrer">
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                View resume ↗
              </a>
              {c.portfolio_url && isHttp(c.portfolio_url) ? (
                <a className="btn-plain" href={c.portfolio_url} target="_blank" rel="noreferrer">
                  Portfolio ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
