"use client";

import {
  ArrowRight,
  Bookmark,
  Briefcase,
  Check,
  ExternalLink,
  FileText,
  FolderGit2,
  GitPullRequest,
  GraduationCap,
  Link2,
  Loader2,
  Mail,
  Sparkles,
  Tags,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { TraceFill } from "@/components/landing-client";
import {
  AI_QUESTIONS,
  LEVEL_LABEL,
  aiAnswers,
  levelOfRow,
  type Education,
  type OpenSource,
  type Project,
  type Row,
  type WorkExperience,
} from "./search-ui";

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

function QAItem({
  n,
  q,
  children,
}: {
  n: number;
  q: string;
  children: React.ReactNode;
}) {
  return (
    <div className="sq-qa">
      <div className="sq-qa-head">
        <span className="sq-qa-num" aria-hidden="true">
          {String(n).padStart(2, "0")}
        </span>
        <p className="sq-qa-q">{q}</p>
      </div>
      <div className="sq-qa-a">{children}</div>
    </div>
  );
}

function AnalysisSection({ row }: { row: Row }) {
  const answers = aiAnswers(row);

  return (
    <section className="mt-6 pt-5 border-t border-line">
      <p className="sq-overline">
        AI analysis — the answers
        <Sparkles size={12} aria-hidden="true" />
      </p>
      <div className="grid gap-2.5 mt-3">
        {AI_QUESTIONS.map((q, i) => (
          <QAItem key={q} n={i + 1} q={q}>
            {answers[i]}
          </QAItem>
        ))}
      </div>
    </section>
  );
}

const nonEmpty = (v: string | null | undefined): string | null =>
  v != null && v.trim() !== "" ? v : null;

const exactNumber = (v: number | null | undefined): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : null;

const salaryValue = (v: number | null | undefined): string | null =>
  typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US") : null;

const isHttp = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim().toLowerCase().startsWith("http");

type DetailItem = {
  k: string;
  v: string | null;
  href?: string;
  external?: boolean;
};

function DetailLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external: boolean;
}) {
  return (
    <a
      href={href}
      className="underline decoration-muted underline-offset-2 transition-colors hover:text-brand-text break-all"
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {label}
    </a>
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const fmtMonth = (v: unknown): string => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})(?:-(\d{2}))?(?:-\d{2})?(?:[T\s].*)?$/);
  if (!m) return s;
  if (!m[2]) return m[1];
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
};

const fmtYear = (v: unknown): string => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})/);
  return m ? m[1] : s;
};

const dateRange = (
  start: string | null | undefined,
  end: string | null | undefined,
  current: boolean | string | null | undefined,
): string => {
  const a = fmtMonth(start);
  const isCurrent = current === true || current === "true";
  const b = isCurrent ? "Present" : fmtMonth(end);
  if (a && b) return `${a} – ${b}`;
  return a || b;
};

const yearRange = (
  start: number | string | null | undefined,
  end: number | string | null | undefined,
): string => {
  const a = fmtYear(start);
  const b = fmtYear(end);
  if (a && b && a !== b) return `${a} – ${b}`;
  return a || b;
};

const GROUP_HEAD =
  "flex items-center gap-2 text-[13.5px] font-semibold text-ink tracking-[-0.01em]";

function GroupHead({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return <h3 className={GROUP_HEAD}>{icon}{children}</h3>;
}

function Body({ label, value }: { label: string; value: string | null | undefined }) {
  const v = nonEmpty(value);
  if (!v) return null;
  return (
    <p className="mt-2 text-[13.5px] leading-[1.65] text-body whitespace-pre-line">
      <span className="font-semibold text-ink">{label} — </span>
      {v}
    </p>
  );
}

function TagList({ items }: { items: string[] | null | undefined }) {
  const list = (items ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim() !== "",
  );
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {list.map((s, i) => (
        <span className="tag" key={`${s}-${i}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

function LinkRow({ items }: { items: { k: string; href: string | null }[] }) {
  const seen = new Set<string>();
  const list: { k: string; href: string }[] = [];
  for (const item of items) {
    const href = (item.href ?? "").trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    list.push({ k: item.k, href });
  }
  if (!list.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
      {list.map((l) => (
        <DetailLink
          key={l.k}
          href={l.href}
          label={l.href}
          external={isHttp(l.href)}
        />
      ))}
    </div>
  );
}

function Entry({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0">
      {children}
    </div>
  );
}

function EntryHead({
  title,
  meta,
  mono,
}: {
  title: string;
  meta?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p
        className={`text-[14.5px] font-semibold text-ink tracking-[-0.01em]${mono ? " font-mono" : ""}`}
      >
        {title}
      </p>
      {nonEmpty(meta) ? (
        <p className="font-mono text-[12.5px] text-muted">{meta}</p>
      ) : null}
    </div>
  );
}

function ExperienceEntry({ x }: { x: WorkExperience }) {
  const company = nonEmpty(x.company_name);
  const title = nonEmpty(x.job_title) ?? company ?? "Role";
  const range = dateRange(x.start_date, x.end_date, x.is_current);
  return (
    <Entry>
      <EntryHead title={title} meta={range} />
      {nonEmpty(x.job_title) && company ? (
        <p className="mt-0.5 text-[13.5px] text-body">{company}</p>
      ) : null}
      <Body label="Description" value={x.description} />
      <Body label="Achievements" value={x.achievements} />
      <TagList items={x.tech_stack} />
    </Entry>
  );
}

function ProjectEntry({ p }: { p: Project }) {
  const role = nonEmpty(p.role_in_project);
  return (
    <Entry>
      <EntryHead title={nonEmpty(p.title) ?? "Project"} meta={p.project_type} />
      {role ? (
        <p className="mt-1 text-[13.5px] text-body">
          <span className="font-semibold text-ink">Role — </span>
          {role}
        </p>
      ) : null}
      <Body label="Problem" value={p.problem_statement} />
      <Body label="Description" value={p.description} />
      <Body label="Impact" value={p.impact_summary} />
      <TagList items={p.tech_stack} />
      <LinkRow
        items={[
          { k: "project", href: p.project_link ?? null },
          { k: "repo", href: p.repo_link ?? null },
          { k: "deployment", href: p.deployment_link ?? null },
        ]}
      />
    </Entry>
  );
}

function EducationEntry({ e }: { e: Education }) {
  const degree = [nonEmpty(e.degree), nonEmpty(e.field_of_study)]
    .filter(Boolean)
    .join(", ");
  return (
    <Entry>
      <EntryHead
        title={nonEmpty(e.institution) ?? "Education"}
        meta={yearRange(e.start_year, e.end_year)}
      />
      {nonEmpty(degree) ? (
        <p className="mt-0.5 text-[13.5px] text-body">{degree}</p>
      ) : null}
      <Body label="Achievements" value={e.achievements} />
    </Entry>
  );
}

function OpenSourceEntry({ o }: { o: OpenSource }) {
  const prs = Array.isArray(o.pr_links) ? o.pr_links : [];
  return (
    <Entry>
      <EntryHead
        title={nonEmpty(o.repo_name) ?? "Repository"}
        meta={o.role}
        mono
      />
      <Body label="Description" value={o.description} />
      <TagList items={o.tech_stack} />
      <LinkRow
        items={[
          { k: "repo", href: o.repo_url ?? null },
          ...prs.map((u, i) => ({ k: `pr-${i}`, href: u })),
        ]}
      />
    </Entry>
  );
}

function ProfileSection({ row }: { row: Row }) {
  const facts: DetailItem[] = [
    { k: "Name", v: nonEmpty(row.full_name) },
    { k: "Headline", v: nonEmpty(row.headline) },
    { k: "Domain", v: nonEmpty(row.domain) },
    { k: "Experience (years)", v: exactNumber(row.total_experience_years) },
    { k: "Location", v: nonEmpty(row.location_city) },
    { k: "Work mode", v: nonEmpty(row.remote_preference) },
    { k: "Availability", v: nonEmpty(row.availability_status) },
    { k: "Minimum salary", v: salaryValue(row.min_salary) },
    { k: "Salary frequency", v: nonEmpty(row.salary_frequency) },
    {
      k: "Email",
      v: nonEmpty(row.contact_email),
      href: row.contact_email ? `mailto:${row.contact_email}` : undefined,
      external: false,
    },
    {
      k: "Phone",
      v: nonEmpty(row.contact_phone),
      href: row.contact_phone ? `tel:${row.contact_phone}` : undefined,
      external: false,
    },
    {
      k: "LinkedIn",
      v: nonEmpty(row.linkedin_url),
      href: row.linkedin_url ?? undefined,
      external: isHttp(row.linkedin_url),
    },
    {
      k: "GitHub",
      v: nonEmpty(row.github_url),
      href: row.github_url ?? undefined,
      external: isHttp(row.github_url),
    },
    {
      k: "Portfolio",
      v: nonEmpty(row.portfolio_url),
      href: row.portfolio_url ?? undefined,
      external: isHttp(row.portfolio_url),
    },
    {
      k: "Resume",
      v: nonEmpty(row.resume_url),
      href: row.resume_url ?? undefined,
      external: isHttp(row.resume_url),
    },
    {
      k: "Photo",
      v: nonEmpty(row.photo_url),
      href: row.photo_url ?? undefined,
      external: isHttp(row.photo_url),
    },
  ];
  const details = facts.filter((d) => d.v !== null);
  const experiences = row.work_experiences ?? [];
  const projects = row.projects ?? [];
  const education = row.education ?? [];
  const openSource = row.open_source_contributions ?? [];
  const skills = row.top_skills ?? [];
  const hasProfile =
    details.length > 0 ||
    experiences.length > 0 ||
    projects.length > 0 ||
    education.length > 0 ||
    openSource.length > 0 ||
    skills.length > 0;

  if (!hasProfile) return null;

  return (
    <section className="mt-6 pt-5 border-t border-line">
      <p className="sq-overline">Details</p>
      <div className="mt-3 grid gap-6">
        {details.length > 0 ? (
          <div>
            <GroupHead icon={<UserRound size={14} aria-hidden="true" />}>
              Profile facts
            </GroupHead>
            <dl className="mt-2.5 grid gap-x-10 lg:grid-cols-2 sq-facts">
              {details.map((d) => (
                <div className="sq-detail-row" key={d.k}>
                  <dt>{d.k}</dt>
                  <dd>
                    {d.href ? (
                      <DetailLink
                        href={d.href}
                        label={d.v ?? ""}
                        external={d.external === true}
                      />
                    ) : (
                      d.v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {experiences.length > 0 ? (
          <div>
            <GroupHead icon={<Briefcase size={14} aria-hidden="true" />}>
              Work experience
            </GroupHead>
            <div className="mt-2 grid">
              {experiences.map((x, i) => (
                <ExperienceEntry key={`exp-${i}`} x={x} />
              ))}
            </div>
          </div>
        ) : null}

        {projects.length > 0 ? (
          <div>
            <GroupHead icon={<FolderGit2 size={14} aria-hidden="true" />}>
              Projects
            </GroupHead>
            <div className="mt-2 grid">
              {projects.map((p, i) => (
                <ProjectEntry key={`proj-${i}`} p={p} />
              ))}
            </div>
          </div>
        ) : null}

        {education.length > 0 ? (
          <div>
            <GroupHead icon={<GraduationCap size={14} aria-hidden="true" />}>
              Education
            </GroupHead>
            <div className="mt-2 grid">
              {education.map((e, i) => (
                <EducationEntry key={`edu-${i}`} e={e} />
              ))}
            </div>
          </div>
        ) : null}

        {openSource.length > 0 ? (
          <div>
            <GroupHead icon={<GitPullRequest size={14} aria-hidden="true" />}>
              Open source
            </GroupHead>
            <div className="mt-2 grid">
              {openSource.map((o, i) => (
                <OpenSourceEntry key={`oss-${i}`} o={o} />
              ))}
            </div>
          </div>
        ) : null}

        {skills.length > 0 ? (
          <div>
            <GroupHead icon={<Tags size={14} aria-hidden="true" />}>
              Skills
            </GroupHead>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {skills.map((s, i) => (
                <span className="tag" key={`skill-${i}`}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function CandidateDetail({
  row,
  sl,
  onShortlist,
}: {
  row: Row;
  sl: "saving" | "saved" | "error" | undefined;
  onShortlist: (id: string) => void;
}) {
  const score =
    typeof row.overall_score === "number" ? Math.round(row.overall_score) : null;
  const level = levelOfRow(row);

  return (
    <div>
      <div className="flex items-start gap-4">
        <Avatar name={row.full_name ?? "Candidate"} src={row.photo_url} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="text-[21px] font-semibold text-ink tracking-[-0.015em]">
              {row.full_name ?? "Candidate"}
            </h2>
            {level ? <LevelPill level={level} /> : null}
          </div>
          {row.headline ? (
            <p className="text-[14.5px] text-body mt-1">{row.headline}</p>
          ) : null}
        </div>
        <div className="flex-none text-right">
          <div className="sq-score">
            {score != null ? (
              <>
                {score}
                <span>/100</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <p className="sq-score-cap">
            {score != null
              ? level
                ? LEVEL_LABEL[level]
                : "weighted fit"
              : "unscored"}
          </p>
        </div>
      </div>

      {score != null ? (
        <div className="mt-4">
          <TraceFill width={`${score}%`} bg="#1F2DE6" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 mt-4">
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

      <AnalysisSection row={row} />

      <ProfileSection row={row} />
    </div>
  );
}
