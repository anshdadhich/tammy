import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  MapPin,
} from "lucide-react";
import PageShell from "@/components/PageShell";
import Avatar from "@/components/Avatar";
import VisibilityToggle from "./visibility-toggle";
import { GET } from "@/app/api/candidates/route";
import { getViewer } from "@/lib/api-auth";
import { driveImageUrl, isDriveLink } from "@/lib/drive";

// --- types (response bundle keys mirror the GET call site) -------------------

type Cand = {
  id: string;
  full_name?: string | null;
  headline?: string | null;
  domain?: string | null;
  current_position?: string | null;
  total_experience_years?: number | null;
  location_city?: string | null;
  remote_preference?: string | null;
  availability_status?: string | null;
  min_salary?: number | null;
  salary_currency?: string | null;
  salary_frequency?: string | null;
  salary_negotiable?: boolean | null;
  open_to_relocation?: boolean | null;
  visibility_status?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  resume_url?: string | null;
  photo_url?: string | null;
};
type Prof = { summary_markdown?: string | null; updated_at?: string | null } | null;
type Proj = {
  id?: string;
  title?: string | null;
  description?: string | null;
  problem_statement?: string | null;
  tech_stack?: string[] | null;
  role_in_project?: string | null;
  project_link?: string | null;
  repo_link?: string | null;
  deployment_link?: string | null;
  impact_summary?: string | null;
  project_type?: string | null;
};
type Exp = {
  company_name?: string | null;
  job_title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
  description?: string | null;
  achievements?: string | null;
  tech_stack?: string[] | null;
};
type Edu = {
  institution?: string | null;
  degree?: string | null;
  field_of_study?: string | null;
  start_year?: number | null;
  end_year?: number | null;
};
type Oss = {
  repo_name?: string | null;
  repo_url?: string | null;
  description?: string | null;
  tech_stack?: string[] | null;
  role?: string | null;
};
type SkillLink = {
  experience_years?: number | null;
  proficiency_level?: string | null;
  skills?: { name?: string } | { name?: string }[] | null;
};
type Depth = Record<string, unknown>;
type Activity = { id?: string; created_at?: string; channel?: string; message?: string | null; score?: number | null; status?: string | null; notes?: string | null; job_id?: string | null };

type Bundle = {
  candidate: Cand;
  profile: Prof;
  contact_log: Activity[];
  matches: Activity[];
  shortlists: Activity[];
  projects: Proj[];
  oss: Oss[];
  experiences: Exp[];
  education: Edu[];
  skills: SkillLink[];
  depths: Record<string, Depth>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The dossier reads exactly like GET /api/candidates?id= — called directly
// (no HTTP self-fetch, so no port/env dependency). Visitor cookie + IP headers
// forward so viewer scoping and rate-limit keying behave identically.
const load = cache(
  async (
    id: string,
  ): Promise<{
    status: number;
    isOwner: boolean;
    bundle: Bundle | null;
  }> => {
    const h = await headers();
    const fwd: Record<string, string> = {};
    const cookie = h.get("cookie");
    const xff = h.get("x-forwarded-for");
    const xri = h.get("x-real-ip");
    if (cookie) fwd.cookie = cookie;
    if (xff) fwd["x-forwarded-for"] = xff;
    if (xri) fwd["x-real-ip"] = xri;

    const req = new Request(
      `http://ssr.internal/api/candidates?id=${encodeURIComponent(id)}`,
      { headers: fwd },
    );
    const viewer = getViewer(req);
    const res = await GET(req);
    if (res.status !== 200) {
      return { status: res.status, isOwner: false, bundle: null };
    }
    const bundle = (await res.json()) as Bundle;
    const isOwner = viewer.kind === "owner" && viewer.id === id;
    return { status: 200, isOwner, bundle };
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Profile not found" };
  const { status, bundle } = await load(id);
  if (status !== 200 || !bundle) return { title: "Profile not found" };
  const c = bundle.candidate;
  const description = (c.headline ?? "").trim() || undefined;
  return {
    title: c.full_name ? String(c.full_name) : "Talent profile",
    ...(description ? { description } : {}),
  };
}

// --- formatting --------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return s.length > 10 ? s.slice(0, 10) : s;
  if (m[2]) {
    const idx = Number(m[2]) - 1;
    return `${MONTHS[idx] ?? m[2]} ${m[1]}`;
  }
  return m[1];
}

function fmtDay(v: unknown): string {
  const s = String(v ?? "");
  return s ? s.slice(0, 10) : "";
}

const AVAIL: Record<string, string> = {
  immediate: "Available immediately",
  notice: "Serving notice",
  inactive: "Not looking right now",
};
const MODE: Record<string, string> = {
  remote_only: "Remote only",
  hybrid: "Hybrid",
  onsite: "On-site",
  flexible: "Flexible",
  remote: "Remote",
};

function resolvePhoto(u?: string | null): string | null {
  if (!u || !/^https?:\/\//.test(u)) return null;
  try {
    if (isDriveLink(u)) return driveImageUrl(u) || u;
  } catch {
    /* fall through to raw url */
  }
  return u;
}

function salaryLine(c: Cand): string | null {
  if (typeof c.min_salary !== "number" || c.min_salary <= 0) return null;
  const cur = (c.salary_currency ?? "INR").toUpperCase();
  const freq =
    c.salary_frequency === "yearly"
      ? "year"
      : c.salary_frequency === "hourly"
        ? "hour"
        : "month";
  return `${cur} ${c.min_salary.toLocaleString()} / ${freq}${c.salary_negotiable === false ? "" : " (negotiable)"}`;
}

// --- minimal, XSS-safe markdown (text nodes only) ----------------------------

type MdBlock =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] };

function parseMd(text: string): MdBlock[] {
  const out: MdBlock[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (list) {
      out.push(list);
      list = null;
    }
  };
  for (const raw of text.split(/\r?\n/)) {
    const h = raw.match(/^\s*(#{1,4})\s+(.*)$/);
    const ol = raw.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = raw.match(/^\s*[-*•]\s+(.*)$/);
    if (h) {
      flush();
      out.push({ type: "h", level: h[1].length, text: h[2] });
      continue;
    }
    if (ol) {
      if (!list || list.type !== "ol") {
        flush();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    if (ul) {
      if (!list || list.type !== "ul") {
        flush();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    flush();
    if (raw.trim()) out.push({ type: "p", text: raw.trim() });
  }
  flush();
  return out;
}

function inlineMd(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g);
  return parts.map((p, i) => {
    if (p.length > 4 && p.startsWith("**") && p.endsWith("**"))
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.length > 2 && p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={i} className="font-mono text-[13.5px] bg-inset rounded px-1.5 py-0.5">
          {p.slice(1, -1)}
        </code>
      );
    const link = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link)
      return (
        <a
          key={i}
          href={link[2]}
          className="text-brand-text underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          {link[1]}
        </a>
      );
    return <span key={i}>{p}</span>;
  });
}

function Markdownish({ text }: { text: string }) {
  const blocks = parseMd(text);
  return (
    <div className="grid gap-3 text-[15.5px] leading-[1.65] text-body">
      {blocks.map((b, i) => {
        if (b.type === "h")
          return (
            <p
              key={i}
              className={
                b.level <= 2
                  ? "text-[16.5px] font-semibold text-ink tracking-[-0.01em] pt-1"
                  : "text-[15.5px] font-semibold text-ink"
              }
            >
              {inlineMd(b.text)}
            </p>
          );
        if (b.type === "p") return <p key={i}>{inlineMd(b.text)}</p>;
        const items = b.items.map((it, j) => <li key={j}>{inlineMd(it)}</li>);
        return b.type === "ol" ? (
          <ol key={i} className="list-decimal pl-5 grid gap-1.5">
            {items}
          </ol>
        ) : (
          <ul key={i} className="list-disc pl-5 grid gap-1.5">
            {items}
          </ul>
        );
      })}
    </div>
  );
}

// --- shared pieces -----------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-[clamp(1.4rem,2.4vw,1.85rem)] font-semibold tracking-[-0.02em] text-ink">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chiplist({ items }: { items?: (string | null | undefined)[] | null }) {
  const clean = (items ?? []).filter((x): x is string => !!x && !!x.trim());
  if (!clean.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {clean.map((t, i) => (
        <span className="tag" key={`${t}-${i}`}>
          {t}
        </span>
      ))}
    </div>
  );
}

function DepthBadges({ depth }: { depth?: Depth | null }) {
  if (!depth) return null;
  const badges: string[] = [];
  const complexity = depth.complexity_score;
  if (typeof complexity === "number") badges.push(`Complexity ${complexity}/10`);
  for (const [key, label] of [
    ["evidence_quality", "Evidence"],
    ["autonomy_level", "Autonomy"],
    ["estimated_seniority_signal", "Level signal"],
  ] as const) {
    const v = depth[key];
    if (typeof v === "string" && v.trim()) {
      const s = v.trim().replace(/_/g, " ");
      badges.push(`${label} ${s.charAt(0).toUpperCase()}${s.slice(1)}`);
    }
  }
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {badges.map((b) => (
        <span className="tag font-mono text-[11.5px]" key={b}>
          {b}
        </span>
      ))}
    </div>
  );
}

// --- page --------------------------------------------------------------------

export default async function TalentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { status, isOwner, bundle } = await load(id);
  if (status === 404 || status === 400) notFound();

  if (status !== 200 || !bundle) {
    // 429 or transient: honest soft state instead of a false "not found".
    return (
      <PageShell>
        <section className="pt-24 pb-24">
          <div className="max-w-[1160px] mx-auto px-6 max-w-xl">
            <div className="rounded-2xl bg-surface shadow-soft-md p-8">
              <h1 className="text-[26px] font-semibold text-ink tracking-[-0.02em]">
                One moment.
              </h1>
              <p className="mt-3 text-[15.5px] leading-[1.6] text-body">
                This record is being read too often right now — give it a minute
                and reload.
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <Link href="/" className="btn btn-primary press">
                  Back home
                </Link>
              </div>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  const c = bundle.candidate;
  const name = c.full_name?.trim() || "Candidate";
  const photo = resolvePhoto(c.photo_url);
  const summary = (bundle.profile?.summary_markdown ?? "").trim();
  const salary = salaryLine(c);
  const availability = c.availability_status ? AVAIL[c.availability_status] : null;
  const mode = c.remote_preference ? MODE[c.remote_preference] : null;

  const skillEntries = bundle.skills.flatMap((s) => {
    const embedded = Array.isArray(s.skills) ? s.skills : s.skills ? [s.skills] : [];
    return embedded
      .map((sk) => sk?.name)
      .filter((n): n is string => !!n)
      .map((n) => ({
        name: n,
        years: s.experience_years,
        level: s.proficiency_level,
      }));
  });

  const channelBtns: ReactNode[] = [];
  if (c.contact_email)
    channelBtns.push(
      <a key="email" href={`mailto:${c.contact_email}`} className="btn btn-primary btn-sm press">
        <Mail size={14} aria-hidden="true" /> Email
      </a>,
    );
  if (c.contact_phone)
    channelBtns.push(
      <a key="phone" href={`tel:${c.contact_phone}`} className="btn btn-secondary btn-sm press">
        {c.contact_phone}
      </a>,
    );
  if (c.resume_url)
    channelBtns.push(
      <a
        key="resume"
        href={c.resume_url}
        className="btn btn-secondary btn-sm press"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FileText size={14} aria-hidden="true" /> Resume
      </a>,
    );
  if (c.linkedin_url)
    channelBtns.push(
      <a
        key="li"
        href={c.linkedin_url}
        className="btn btn-secondary btn-sm press"
        target="_blank"
        rel="noopener noreferrer"
      >
        LinkedIn <ExternalLink size={13} aria-hidden="true" />
      </a>,
    );
  if (c.github_url)
    channelBtns.push(
      <a
        key="gh"
        href={c.github_url}
        className="btn btn-secondary btn-sm press"
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub <ExternalLink size={13} aria-hidden="true" />
      </a>,
    );
  if (c.portfolio_url)
    channelBtns.push(
      <a
        key="pf"
        href={c.portfolio_url}
        className="btn btn-secondary btn-sm press"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Link2 size={14} aria-hidden="true" /> Portfolio
      </a>,
    );

  const hasAnyEvidence =
    bundle.projects.length > 0 ||
    bundle.experiences.length > 0 ||
    bundle.oss.length > 0 ||
    bundle.education.length > 0;
  const hasPrivate =
    bundle.contact_log.length > 0 ||
    bundle.matches.length > 0 ||
    bundle.shortlists.length > 0;

  return (
    <PageShell>
      {/* header */}
      <section className="pt-20 lg:pt-28 pb-8">
        <div className="max-w-[1160px] mx-auto px-6">
          <div
            className="rise flex flex-wrap items-center gap-3"
            style={{ "--d": "60ms" } as React.CSSProperties}
          >
            <span className="meta-chip">Talent record</span>
            {isOwner ? (
              <VisibilityToggle id={c.id} initial={c.visibility_status ?? "visible"} />
            ) : null}
          </div>

          <div
            className="rise mt-5 flex flex-wrap items-start justify-between gap-6"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            <div className="flex items-center gap-4 min-w-0">
              <Avatar name={name} src={photo} size={64} />
              <div className="min-w-0">
                <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold tracking-[-0.03em] leading-[1.06] text-ink">
                  {name}
                </h1>
                {c.headline ? (
                  <p className="text-[16px] text-body mt-1.5 max-w-[52ch]">
                    {c.headline}
                  </p>
                ) : c.current_position ? (
                  <p className="text-[16px] text-body mt-1.5">{c.current_position}</p>
                ) : null}
              </div>
            </div>
            {channelBtns.length ? (
              <div className="flex flex-wrap items-center gap-2.5">
                {channelBtns}
              </div>
            ) : null}
          </div>

          <div
            className="rise mt-5 flex flex-wrap gap-2.5"
            style={{ "--d": "280ms" } as React.CSSProperties}
          >
            {c.domain ? <span className="meta-chip">{c.domain}</span> : null}
            {typeof c.total_experience_years === "number" ? (
              <span className="meta-chip">{c.total_experience_years} yrs experience</span>
            ) : null}
            {c.location_city ? (
              <span className="meta-chip">
                <MapPin size={13} aria-hidden="true" /> {c.location_city}
              </span>
            ) : null}
            {mode ? <span className="meta-chip">{mode}</span> : null}
            {availability ? <span className="meta-chip">{availability}</span> : null}
            {salary ? <span className="meta-chip">{salary}</span> : null}
          </div>
        </div>
      </section>

      {/* body */}
      <section className="pb-24">
        <div className="max-w-[1160px] mx-auto px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div>
              <Section title="About">
                {summary ? (
                  <Markdownish text={summary} />
                ) : (
                  <div className="empty-note">
                    The summary is still being written — background processing
                    usually finishes within a couple of minutes. The raw record
                    below is complete either way.
                  </div>
                )}
              </Section>

              {bundle.projects.length ? (
                <Section title="Projects">
                  <div className="grid gap-5">
                    {bundle.projects.map((p, i) => (
                      <article
                        className="rounded-2xl bg-surface shadow-soft-md p-5 sm:p-6"
                        key={p.id ?? `proj-${i}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-[16.5px] font-semibold text-ink tracking-[-0.01em]">
                              {p.title ?? "Project"}
                            </h3>
                            <p className="text-[13px] text-muted mt-0.5">
                              {[p.role_in_project, p.project_type?.replace(/_/g, " ")]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {p.project_link ? (
                              <a
                                className="tag hover:text-brand-text transition-colors"
                                href={p.project_link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Live <ExternalLink size={12} aria-hidden="true" />
                              </a>
                            ) : null}
                            {p.repo_link ? (
                              <a
                                className="tag hover:text-brand-text transition-colors"
                                href={p.repo_link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Repo <ExternalLink size={12} aria-hidden="true" />
                              </a>
                            ) : null}
                            {p.deployment_link && p.deployment_link !== p.project_link ? (
                              <a
                                className="tag hover:text-brand-text transition-colors"
                                href={p.deployment_link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Demo <ExternalLink size={12} aria-hidden="true" />
                              </a>
                            ) : null}
                          </div>
                        </div>

                        {p.description ? (
                          <p className="text-[14.5px] leading-[1.6] text-body mt-3">
                            {p.description}
                          </p>
                        ) : null}
                        {p.problem_statement ? (
                          <p className="text-[14px] leading-[1.6] text-muted mt-2">
                            <span className="font-semibold text-body">Problem — </span>
                            {p.problem_statement}
                          </p>
                        ) : null}
                        {p.impact_summary ? (
                          <div className="text-[14.5px] leading-[1.6] text-body mt-3 grid gap-2 pt-3 border-t border-line">
                            {p.impact_summary
                              .split(/\n{2,}|\n/)
                              .map((para) => para.trim())
                              .filter(Boolean)
                              .map((para, j) => (
                                <p key={j}>{para}</p>
                              ))}
                          </div>
                        ) : null}

                        <div className="mt-3">
                          <Chiplist items={p.tech_stack} />
                        </div>
                        <DepthBadges depth={p.id ? bundle.depths[p.id] : null} />
                      </article>
                    ))}
                  </div>
                </Section>
              ) : null}

              {bundle.experiences.length ? (
                <Section title="Experience">
                  <div className="grid gap-5">
                    {bundle.experiences.map((x, i) => {
                      const dates = [
                        fmtDate(x.start_date),
                        x.is_current ? "Present" : fmtDate(x.end_date),
                      ]
                        .filter(Boolean)
                        .join(" — ");
                      const achievements = (x.achievements ?? "")
                        .split(/\n+/)
                        .map((a) => a.trim())
                        .filter(Boolean);
                      return (
                        <article
                          className="rounded-2xl bg-surface shadow-soft-md p-5 sm:p-6"
                          key={`exp-${i}`}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <h3 className="text-[16px] font-semibold text-ink tracking-[-0.01em]">
                              {x.job_title ?? "Role"}
                              {x.company_name ? (
                                <span className="text-muted font-normal">
                                  {" "}
                                  · {x.company_name}
                                </span>
                              ) : null}
                            </h3>
                            {dates ? (
                              <span className="font-mono text-[12.5px] text-muted">
                                {dates}
                              </span>
                            ) : null}
                          </div>
                          {x.description ? (
                            <p className="text-[14.5px] leading-[1.6] text-body mt-2.5">
                              {x.description}
                            </p>
                          ) : null}
                          {achievements.length ? (
                            <ul className="list-disc pl-5 mt-2.5 grid gap-1.5 text-[14.5px] leading-[1.6] text-body">
                              {achievements.map((a, j) => (
                                <li key={j}>{a}</li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="mt-3">
                            <Chiplist items={x.tech_stack} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </Section>
              ) : null}

              {bundle.oss.length ? (
                <Section title="Open source">
                  <div className="grid gap-4">
                    {bundle.oss.map((o, i) => (
                      <article
                        className="rounded-2xl bg-surface shadow-soft-md p-5 sm:p-6"
                        key={`oss-${i}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-[15.5px] font-semibold text-ink font-mono">
                            {o.repo_name ?? "repo"}
                            {o.role ? (
                              <span className="text-muted font-sans font-normal text-[13px]">
                                {" "}
                                · {o.role}
                              </span>
                            ) : null}
                          </h3>
                          {o.repo_url ? (
                            <a
                              className="tag hover:text-brand-text transition-colors"
                              href={o.repo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                        {o.description ? (
                          <p className="text-[14.5px] leading-[1.6] text-body mt-2">
                            {o.description}
                          </p>
                        ) : null}
                        <div className="mt-3">
                          <Chiplist items={o.tech_stack} />
                        </div>
                      </article>
                    ))}
                  </div>
                </Section>
              ) : null}

              {bundle.education.length ? (
                <Section title="Education">
                  <div className="grid gap-4">
                    {bundle.education.map((e, i) => {
                      const years = [e.start_year, e.end_year].filter(Boolean).join(" – ");
                      return (
                        <div
                          className="rounded-2xl bg-surface shadow-soft-md p-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                          key={`edu-${i}`}
                        >
                          <div>
                            <p className="text-[15.5px] font-semibold text-ink">
                              {[e.degree, e.field_of_study].filter(Boolean).join(", ") ||
                                e.institution}
                            </p>
                            <p className="text-[14px] text-muted mt-0.5">
                              {e.institution}
                            </p>
                          </div>
                          {years ? (
                            <span className="font-mono text-[12.5px] text-muted">
                              {years}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              ) : null}

              {!summary && !hasAnyEvidence ? (
                <div className="empty-note">
                  This record is still being assembled — summary, skills, and the
                  search embedding fill in as background processing completes.
                </div>
              ) : null}
            </div>

            {/* aside */}
            <aside className="grid gap-5 lg:sticky lg:top-24">
              {skillEntries.length ? (
                <div className="rounded-2xl bg-surface shadow-soft-md p-6">
                  <h3 className="text-[15px] font-semibold text-ink">Skills</h3>
                  <div className="flex flex-wrap gap-2 mt-3.5">
                    {skillEntries.map((s) => (
                      <span
                        className="tag"
                        key={s.name}
                        title={[
                          s.level ? `Proficiency: ${s.level}` : null,
                          typeof s.years === "number" ? `${s.years} yrs` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined}
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl bg-surface shadow-soft-md p-6">
                <h3 className="text-[15px] font-semibold text-ink">At a glance</h3>
                <dl className="grid gap-3 mt-3.5 text-[14px]">
                  {[
                    ["Work mode", mode],
                    ["Availability", availability],
                    ["Expectation", salary],
                    [
                      "Relocation",
                      typeof c.open_to_relocation === "boolean"
                        ? c.open_to_relocation
                          ? "Open to relocating"
                          : "Not relocating"
                        : null,
                    ],
                    ["Based in", c.location_city ?? null],
                  ]
                    .filter(([, v]) => !!v)
                    .map(([k, v]) => (
                      <div
                        className="flex items-baseline justify-between gap-3 border-b border-line last:border-0 pb-3 last:pb-0"
                        key={k}
                      >
                        <dt className="text-muted">{k}</dt>
                        <dd className="text-ink font-medium text-right">{v}</dd>
                      </div>
                    ))}
                </dl>
              </div>

              {hasPrivate ? (
                <div className="rounded-2xl bg-surface shadow-soft-md p-6">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: "var(--warn)" }}
                      aria-hidden="true"
                    />
                    <h3 className="text-[15px] font-semibold text-ink">
                      Private activity
                    </h3>
                  </div>
                  <p className="field-hint mt-1">
                    Visible only to this profile&apos;s owner and signed-in
                    hiring teams.
                  </p>
                  <ul className="grid gap-2.5 mt-3.5 text-[13.5px] leading-[1.5] text-body">
                    {bundle.shortlists.map((s) => (
                      <li key={`sl-${s.id}`} className="flex justify-between gap-3">
                        <span>Shortlisted{ s.status ? ` · ${s.status}` : ""}</span>
                        <span className="font-mono text-[12px] text-muted flex-none">
                          {fmtDay(s.created_at)}
                        </span>
                      </li>
                    ))}
                    {bundle.matches.map((m) => (
                      <li key={`m-${m.id}`} className="flex justify-between gap-3">
                        <span>
                          Surfaced in a search
                          {typeof m.score === "number"
                            ? ` · score ${Math.round(m.score)}`
                            : ""}
                        </span>
                        <span className="font-mono text-[12px] text-muted flex-none">
                          {fmtDay(m.created_at)}
                        </span>
                      </li>
                    ))}
                    {bundle.contact_log.map((v) => (
                      <li key={`v-${v.id}`} className="flex justify-between gap-3">
                        <span>
                          {v.channel ? `Contacted via ${v.channel}` : "Contacted"}
                          {v.job_id ? " · job" : ""}
                        </span>
                        <span className="font-mono text-[12px] text-muted flex-none">
                          {fmtDay(v.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl bg-surface shadow-soft-md p-6">
                <p className="text-[14px] leading-[1.6] text-body">
                  Hiring for something like this?
                </p>
                <Link href="/hire/search" className="btn btn-primary btn-sm press mt-3.5">
                  Run a search <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
