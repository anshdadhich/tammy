export type Sub = Partial<
  Record<"semantic" | "skill" | "depth" | "constraints" | "seniority", number>
>;

export type Judge = {
  overall_score?: number;
  recommendation?: string;
  strengths?: string[];
  gaps?: string[];
  matched_requirements?: string[];
  missing_requirements?: string[];
  project_evidence?: string[];
  risk_factors?: string[];
  interview_questions?: string[];
  salary_fit?: string;
  location_fit?: string;
  seniority_fit?: string;
};

export type WorkExperience = {
  company_name?: string | null;
  job_title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | string | null;
  description?: string | null;
  achievements?: string | null;
  tech_stack?: string[] | null;
};

export type Project = {
  id?: string | number | null;
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

export type Education = {
  institution?: string | null;
  degree?: string | null;
  field_of_study?: string | null;
  start_year?: number | null;
  end_year?: number | null;
  achievements?: string | null;
};

export type OpenSource = {
  repo_name?: string | null;
  repo_url?: string | null;
  description?: string | null;
  pr_links?: string[] | null;
  tech_stack?: string[] | null;
  role?: string | null;
};

export type Row = {
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
  work_experiences?: WorkExperience[] | null;
  projects?: Project[] | null;
  education?: Education[] | null;
  open_source_contributions?: OpenSource[] | null;
};

export type Session = { name?: string; email: string };

export type Run = {
  id: number;
  title: string;
  prompt: string;
  results: Row[];
  meta: { queryText: string; cached: boolean; deep: boolean };
  deepError: string | null;
  ranAt: string;
};

export type SlState = Record<string, "saving" | "saved" | "error">;

export const EXAMPLES = [
  {
    label: "Designer · fintech · remote",
    prompt:
      "Product designer for a fintech team - owns flows end to end, from onboarding to payouts, and makes dense data tables legible. Figma-first, comfortable shipping with engineers, remote across India.",
    skills: ["Figma"],
  },
  {
    label: "Backend · Node/Postgres",
    prompt:
      "Backend engineer on Node/Postgres - designs the service boundaries, owns the schema, and keeps p95 honest under load. Payments experience is a plus; rigor is the requirement.",
    skills: ["Node.js", "PostgreSQL"],
  },
  {
    label: "Design systems lead",
    prompt:
      "Design systems lead - builds and governs the component library two product teams actually ship with. Tokens to documentation, adoption metrics, and a migration plan people finish.",
    skills: ["Design Systems", "Figma"],
  },
] as const;

export const SENIORITY_OPTS = [
  { v: "intern", label: "Intern" },
  { v: "junior", label: "Junior" },
  { v: "mid", label: "Mid" },
  { v: "senior", label: "Senior" },
  { v: "lead", label: "Lead" },
  { v: "staff", label: "Staff" },
] as const;

export const MODE_OPTS = [
  { v: "remote", label: "Remote" },
  { v: "hybrid", label: "Hybrid" },
  { v: "onsite", label: "On-site" },
] as const;

export const EXP_RANGES = [
  { label: "Any", min: 0, max: 50 },
  { label: "1–3 years", min: 1, max: 3 },
  { label: "3–5 years", min: 3, max: 5 },
  { label: "5–8 years", min: 5, max: 8 },
  { label: "8+ years", min: 8, max: 50 },
] as const;

export const SUGGESTIONS = [
  "Figma",
  "React",
  "TypeScript",
  "Node.js",
  "Go",
  "PostgreSQL",
  "Python",
  "Redis",
];

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD", "AED", "AUD", "CAD"];

export const SUB_ROWS: [keyof Sub, string][] = [
  ["semantic", "Semantic match"],
  ["skill", "Skills overlap"],
  ["depth", "Depth of work"],
  ["constraints", "Constraints"],
  ["seniority", "Seniority fit"],
];

export const AI_QUESTIONS = [
  "Which parts of their experience match our requirement?",
  "What have they built that maps to this role?",
  "Where do they fall short of our requirement?",
  "Should we move them forward?",
] as const;

export const LEVEL_LABEL = {
  strong: "Strong match",
  partial: "Partial",
  weak: "Weak",
} as const;

export const MODE_LABEL: Record<string, string> = {
  remote: "Remote",
  remote_only: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  flexible: "Flexible",
};

export const AVAIL_LABEL: Record<string, string> = {
  immediate: "Available now",
  notice: "On notice",
  inactive: "Not looking",
};

export const levelOf = (score: number): "strong" | "partial" | "weak" =>
  score >= 75 ? "strong" : score >= 50 ? "partial" : "weak";

export function levelOfRow(row: Row): "strong" | "partial" | "weak" | null {
  if (
    row.match_level === "strong" ||
    row.match_level === "partial" ||
    row.match_level === "weak"
  ) {
    return row.match_level;
  }
  if (typeof row.overall_score === "number" && Number.isFinite(row.overall_score)) {
    return levelOf(Math.round(row.overall_score));
  }
  return null;
}

const asText = (v: string | null | undefined): string =>
  typeof v === "string" ? v.trim() : "";

const joinList = (items: (string | null | undefined)[], max = 4): string => {
  const parts = items
    .map(asText)
    .filter(Boolean)
    .slice(0, max)
    .map((p) => p.replace(/\.$/, ""));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
};

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

type SubStat = { label: string; pct: number };

function subStats(row: Row): SubStat[] {
  const out: SubStat[] = [];
  for (const [k, label] of SUB_ROWS) {
    const raw = row.sub_scores?.[k];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    out.push({
      label,
      pct: Math.max(0, Math.min(100, Math.round(raw * 100))),
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

const subText = (stats: SubStat[]): string =>
  stats.map((s) => `${s.label.toLowerCase()} ${s.pct}%`).join(" · ");

export function aiAnswers(row: Row): [string, string, string, string] {
  const judge = row.judge;
  const stats = subStats(row);
  const strongest = stats.slice(0, 2);
  const weakest = stats.slice(-2);
  const lowList = weakest.filter((s) => s.pct < 60);
  const depth = stats.find((s) => s.label === "Depth of work");
  const matched = (judge?.matched_requirements ?? []).map(asText).filter(Boolean);
  const missing = (judge?.missing_requirements ?? []).map(asText).filter(Boolean);
  const strengths = (judge?.strengths ?? []).map(asText).filter(Boolean);
  const gaps = (judge?.gaps ?? []).map(asText).filter(Boolean);
  const evidence = (judge?.project_evidence ?? []).map(asText).filter(Boolean);
  const risks = (judge?.risk_factors ?? []).map(asText).filter(Boolean);
  const skills = (row.top_skills ?? []).map(asText).filter(Boolean);
  const score =
    typeof row.overall_score === "number" && Number.isFinite(row.overall_score)
      ? Math.round(row.overall_score)
      : null;
  const level = levelOfRow(row);
  const headline = asText(row.headline);
  const years =
    typeof row.total_experience_years === "number" && row.total_experience_years > 0
      ? `${row.total_experience_years} years of experience`
      : "";
  const profile = [headline, years].filter(Boolean).join(", ") || asText(row.domain);

  const a1: string[] = [];
  if (matched.length) {
    a1.push(`Deep read matched them on ${joinList(matched)} against the brief.`);
  }
  if (strongest.length) {
    const stack = skills.length ? `; core stack covers ${joinList(skills)}` : "";
    a1.push(`${cap(subText(strongest))} lead the sub-scores${stack}.`);
  } else if (skills.length) {
    a1.push(`Core stack covers ${joinList(skills)}.`);
  }
  if (!a1.length) {
    a1.push(
      profile
        ? `${cap(profile)} is what this row documents - with no sub-scores returned, it is the closest read on the match.`
        : level
          ? `No sub-scores or skill list came back - the ${LEVEL_LABEL[level].toLowerCase()} rating is the only match signal.`
          : `No sub-scores, skills or rating came back for this row, so there is nothing to read the match against.`,
    );
  }

  const a2: string[] = [];
  if (strengths.length) {
    a2.push(sentence(`Deep read strengths: ${joinList(strengths.slice(0, 3))}`));
  }
  if (evidence.length) {
    a2.push(sentence(`Closest project evidence: ${joinList(evidence, 2)}`));
  }
  if (depth) a2.push(`Depth of work scores ${depth.pct}% on this profile.`);
  const depthless = !strengths.length && !evidence.length && !depth;
  if (skills.length) {
    a2.push(
      depthless
        ? `Ships with ${joinList(skills)} - no project or depth figures came back for this row.`
        : `Ships with ${joinList(skills)}.`,
    );
  }
  if (!a2.length) {
    a2.push(
      profile
        ? `${cap(profile)} is what the profile documents for this role.`
        : `No project, skill or depth detail came back for this row.`,
    );
  }

  const poor = [
    judge?.salary_fit === "poor" ? "salary fit" : null,
    judge?.location_fit === "poor" ? "location fit" : null,
    judge?.seniority_fit === "poor" ? "seniority fit" : null,
  ].filter((v): v is string => v !== null);

  const a3: string[] = [];
  if (missing.length) a3.push(sentence(`Missing requirements: ${joinList(missing)}`));
  if (gaps.length) a3.push(sentence(`Deep read gaps: ${joinList(gaps.slice(0, 3))}`));
  if (risks.length) a3.push(sentence(`Risk factors: ${joinList(risks.slice(0, 2))}`));
  if (poor.length) a3.push(`Fit checks read poor on ${joinList(poor)}.`);
  if (!a3.length && weakest.length) {
    a3.push(
      lowList.length
        ? `Weakest sub-scores are ${subText(lowList)} - the softest part of this match.`
        : `No sub-score dips below 60% - the lowest are ${subText(
            weakest,
          )}, so any shortfall sits outside the scored dimensions.`,
    );
  }
  if (!a3.length) {
    a3.push(
      profile
        ? `No sub-scores or judge notes came back for this row (${profile}), so the shortfalls are unverified.`
        : `No sub-scores or judge notes came back for this row, so the shortfalls are unverified.`,
    );
  }

  const soft = lowList.length ? `the soft spots are ${subText(lowList)}` : "";
  const lowNote = weakest.length ? `, with ${subText(weakest)} the lowest` : "";
  let a4 = asText(judge?.recommendation);
  if (a4) a4 = sentence(a4);
  if (!a4) {
    if (score != null && level === "strong") {
      a4 = `Move them forward - ${score}/100, a strong match${
        strongest.length ? `, led by ${subText(strongest)}` : ""
      }.`;
    } else if (score != null && level === "partial") {
      a4 = soft
        ? `Worth a screen - ${score}/100 overall, but ${soft}; probe those on the first call.`
        : `Worth a screen - ${score}/100 overall${lowNote}; probe those areas on the first call.`;
    } else if (score != null && level === "weak") {
      a4 = `Hold for now - ${score}/100, a weak match${soft ? `; ${soft}` : lowNote}.`;
    } else {
      a4 = `No overall score on this row, so the call stays manual - review the profile before advancing.`;
    }
  }

  return [a1.join(" "), a2.join(" "), a3.join(" "), a4];
}

export function salaryLine(
  min: number | null | undefined,
  freq: string | null | undefined,
) {
  if (typeof min !== "number" || min <= 0) return null;
  const suffix =
    freq === "yearly" ? "/yr" : freq === "hourly" ? "/hr" : freq === "monthly" ? "/mo" : "";
  return `min ${min.toLocaleString()}${suffix ? ` ${suffix}` : ""}`;
}

export function deriveTitle(p: string): string {
  const first =
    p.split(/\n/)[0].trim() || p.trim().split(/\s+/).slice(0, 8).join(" ");
  const cut = first.search(/\s+[-–|·]\s+/);
  let t = cut > 6 ? first.slice(0, cut).trim() : first;
  if (t.length > 90) t = t.slice(0, 90).replace(/\s+\S*$/, "");
  return t || "Open role";
}

export function flattenErrors(errors: unknown): Record<string, string> {
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

export function stageDefs(o: {
  deep: boolean;
  skills: number;
  mode: string;
  exp: string;
}) {
  const exp = o.exp === "Any" ? "any experience" : o.exp.toLowerCase();
  const base = [
    { label: "Parse brief", sub: "reading the brief" },
    { label: "Embed query", sub: "turning the role into a search vector" },
    {
      label: "Hybrid retrieval",
      sub: `${o.skills} must-have${o.skills === 1 ? "" : "s"} · ${o.mode.toLowerCase()} · ${exp}`,
    },
    { label: "Score 5 dimensions", sub: "ranked by evidence, not keywords" },
  ];
  if (o.deep) {
    base.push({
      label: "Deep Read judge",
      sub: "judge reads top profiles in full - slower, sharper",
    });
  }
  return base;
}
