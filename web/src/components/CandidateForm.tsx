"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import SkillPicker from "./SkillPicker";
import OnboardingStepper from "./OnboardingStepper";
import GooeySlider from "./GooeySlider";
import { LOCATIONS } from "@/lib/skills";

export type FormState = {
  name: string;
  email: string;
  phone: string;
  location: string;
  photo_url: string;
  role: string;
  current_role: string;
  headline: string;
  domain: string;
  exp: number;
  skills: string[];
  experiences: {
    company: string;
    title: string;
    start_date: string;
    end_date: string;
    current: boolean;
    description: string;
    achievements: string;
    tech: string;
  }[];
  projects: {
    title: string;
    description: string;
    problem: string;
    tech: string;
    role: string;
    live: string;
    repo: string;
    demo: string;
    impact: string;
    users_scale: string;
    hardest_challenge: string;
    personal_contribution: string;
    project_type: string;
  }[];
  education: {
    institution: string;
    degree: string;
    field: string;
    years: string;
    achievements: string;
  }[];
  oss: {
    repo_name: string;
    repo_url: string;
    description: string;
    pr_links: string;
    tech: string;
    role: string;
  }[];
  github: string;
  linkedin: string;
  portfolio: string;
  resume_url: string;
  extraLinks: { heading: string; url: string }[];
  min_salary: number;
  currency: string;
  frequency: "hourly" | "monthly" | "yearly";
  negotiable: boolean;
  location_pref: string;
  remote_pref: "onsite" | "hybrid" | "remote";
  relocation: boolean;
  availability: string;
  notice_period: string;
  visibility: "visible" | "hidden" | "inactive";
  consent: boolean;
};

export function blankForm(): FormState {
  return {
    name: "",
    email: "",
    phone: "",
    location: "",
    photo_url: "",
    role: "",
    current_role: "",
    headline: "",
    domain: "",
    exp: 0,
    skills: [],
    experiences: [],
    projects: [],
    oss: [],
    education: [],
    github: "",
    linkedin: "",
    portfolio: "",
    resume_url: "",
    extraLinks: [],
    min_salary: 0,
    currency: "INR",
    frequency: "monthly",
    negotiable: true,
    location_pref: "",
    remote_pref: "remote",
    relocation: false,
    availability: "Immediate",
    notice_period: "",
    visibility: "visible",
    consent: false,
  };
}

/** Demo data for the "Autofill test data" testing helper. */
export function demoForm(): FormState {
  return {
    name: "Aarav Mehta",
    email: "aarav.demo@example.com",
    phone: "+919876543210",
    location: "Bengaluru",
    photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80",
    role: "Product Designer",
    current_role: "Senior Product Designer",
    headline: "Product designer, building in code.",
    domain: "Design",
    exp: 4,
    skills: ["Figma", "React", "JavaScript", "TypeScript", "Tailwind CSS"],
    experiences: [
      {
        company: "Abadikan",
        title: "Senior Product Designer",
        start_date: "2023-01",
        end_date: "",
        current: true,
        description: "Lead product design across web apps and design systems.",
        achievements: "Shipped design system adopted by 5 teams.",
        tech: "Figma, React, Storybook",
      },
      {
        company: "Lumoshive",
        title: "Product Designer",
        start_date: "2021-06",
        end_date: "2022-12",
        current: false,
        description: "Shipped multi-tenant dashboards and iOS component libraries.",
        achievements: "Cut dashboard load-time complaints by 40%.",
        tech: "Figma, Swift, Sketch",
      },
    ],
    projects: [
      {
        title: "Pulse AI — decision engine for async teams",
        description: "A SaaS concept that turns scattered standups into one decision feed with owners and deadlines. Designed the full flow from onboarding to weekly digest, then built a working prototype used by real teams.",
        problem: "Async teams lose decisions across chat threads and nobody knows what was agreed.",
        tech: "React, TypeScript, Supabase",
        role: "Design + frontend",
        live: "https://pulse-ai-demo.example.com",
        repo: "https://github.com/aaravdemo/pulse-ai",
        demo: "",
        impact: "Prototype tested with 12 teams, 9 said they'd pay.",
        users_scale: "12 pilot teams",
        hardest_challenge: "Keeping the feed readable at 200+ decisions a week.",
        personal_contribution: "Everything except the landing copy.",
        project_type: "prototype",
      },
      {
        title: "SyroKit — design tokens for designers",
        description: "Logo grid system and token pipeline that keeps brand and product in sync, from Figma variables to production CSS.",
        problem: "Brand drift across marketing and product surfaces after every redesign.",
        tech: "Figma API, React",
        role: "Founder",
        live: "https://syrokit.example.com",
        repo: "https://github.com/aaravdemo/syrokit",
        demo: "",
        impact: "Used in 3 client projects.",
        users_scale: "3 client teams",
        hardest_challenge: "Naming tokens designers actually remember.",
        personal_contribution: "Token architecture and docs.",
        project_type: "freelance",
      },
    ],
    oss: [
      {
        repo_name: "shadcn-ui/ui",
        repo_url: "https://github.com/shadcn-ui/ui",
        description: "Fixed focus-visible rings on dialog components and added keyboard navigation tests.",
        pr_links: "https://github.com/shadcn-ui/ui/pull/1000",
        tech: "React, TypeScript, Radix UI",
        role: "Contributor",
      },
    ],
    education: [
      {
        institution: "National Institute of Design",
        degree: "B.Des",
        field: "Communication Design",
        years: "2017 - 2021",
        achievements: "Graduated with distinction.",
      },
    ],
    github: "https://github.com/aaravdemo",
    linkedin: "https://linkedin.com/in/aaravdemo",
    portfolio: "https://aaravdemo.design",
    resume_url: "https://drive.google.com/file/d/1aaravDemoResume2024/view?usp=sharing",
    extraLinks: [{ heading: "Twitter", url: "https://x.com/aaravdemo" }],
    min_salary: 120000,
    currency: "INR",
    frequency: "monthly",
    negotiable: true,
    location_pref: "Remote, Bengaluru",
    remote_pref: "remote",
    relocation: false,
    availability: "Immediate",
    notice_period: "",
    visibility: "visible",
    consent: true,
  };
}

/** Convert a GET /api/candidates bundle back into flat form state. */
export function bundleToForm(bundle: {
  candidate: Record<string, any>;
  projects: Record<string, any>[];
  experiences: Record<string, any>[];
  education: Record<string, any>[];
  skills: { skills?: { name?: string } | { name?: string }[] | null }[];
}): FormState {
  const c = bundle.candidate ?? {};
  const f = blankForm();
  f.name = c.full_name ?? "";
  f.email = c.contact_email ?? "";
  f.phone = c.contact_phone ?? "";
  f.location = c.location_city ?? "";
  f.photo_url = /^https?:\/\//i.test(c.photo_url ?? "") ? c.photo_url : "";
  f.role = c.current_position ?? "";
  f.current_role = c.current_position ?? "";
  f.headline = c.headline ?? "";
  f.domain = c.domain ?? "";
  f.exp = Number(c.total_experience_years ?? 0);
  f.skills = (bundle.skills ?? [])
    .flatMap((s) => {
      const n = s.skills;
      if (!n) return [];
      return (Array.isArray(n) ? n : [n]).map((x) => x?.name).filter(Boolean) as string[];
    });
  f.experiences = (bundle.experiences ?? []).map((e) => ({
    company: e.company_name ?? "",
    title: e.job_title ?? "",
    start_date: String(e.start_date ?? "").slice(0, 7),
    end_date: String(e.end_date ?? "").slice(0, 7),
    current: !!e.is_current,
    description: e.description ?? "",
    achievements: e.achievements ?? "",
    tech: ((e.tech_stack ?? []) as string[]).join(", "),
  }));
  f.projects = (bundle.projects ?? []).map((p) => ({
    title: p.title ?? "",
    description: p.description ?? "",
    problem: p.problem_statement ?? "",
    tech: ((p.tech_stack ?? []) as string[]).join(", "),
    role: p.role_in_project ?? "",
    live: p.project_link ?? "",
    repo: p.repo_link ?? "",
    demo: p.deployment_link ?? "",
    impact: (p.impact_summary ?? "").split(/\n\s*\n|\s\|\s/)[0] ?? "",
    users_scale: "",
    hardest_challenge: "",
    personal_contribution: "",
    project_type: p.project_type ?? "",
  }));
  f.education = (bundle.education ?? []).map((e) => ({
    institution: e.institution ?? "",
    degree: e.degree ?? "",
    field: e.field_of_study ?? "",
    years: [e.start_year, e.end_year].filter(Boolean).join(" - "),
    achievements: e.achievements ?? "",
  }));
  f.oss = ((bundle as Record<string, any>).oss ?? []).map((o: Record<string, any>) => ({
    repo_name: o.repo_name ?? "",
    repo_url: o.repo_url ?? "",
    description: o.description ?? "",
    pr_links: ((o.pr_links ?? []) as string[]).join(", "),
    tech: ((o.tech_stack ?? []) as string[]).join(", "),
    role: o.role ?? "Contributor",
  }));
  f.github = c.github_url ?? "";
  f.linkedin = c.linkedin_url ?? "";
  f.portfolio = /^https?:\/\//i.test(c.portfolio_url ?? "") ? c.portfolio_url : "";
  f.resume_url = /^https?:\/\//i.test(c.resume_url ?? "") ? c.resume_url : "";
  f.min_salary = Number(c.min_salary ?? 0);
  f.currency = c.salary_currency ?? "INR";
  f.frequency = (c.salary_frequency ?? "monthly") as FormState["frequency"];
  f.negotiable = c.salary_negotiable ?? true;
  const rp = c.remote_preference ?? "";
  f.remote_pref = rp === "remote_only" ? "remote" : rp === "hybrid" ? "hybrid" : rp === "onsite" ? "onsite" : "remote";
  f.relocation = !!c.open_to_relocation;
  f.availability =
    c.availability_status === "immediate" ? "Immediate" : c.availability_status === "inactive" ? "Inactive" : "Notice period";
  f.visibility = (c.visibility_status ?? "visible") as FormState["visibility"];
  f.consent = true;
  return f;
}

export function formToPayload(f: FormState): Record<string, unknown> {
  const csv = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);
  return {
    name: f.name.trim(),
    email: f.email.trim(),
    phone: f.phone.trim(),
    location: f.location.trim(),
    photo_url: f.photo_url.trim(),
    role: f.role.trim(),
    current_role: f.current_role.trim(),
    headline: f.headline.trim(),
    domain: f.domain.trim(),
    exp: Number(f.exp) || 0,
    skills: f.skills,
    experiences: f.experiences
      .filter((e) => e.company.trim() && e.title.trim())
      .map((e) => ({
        company: e.company.trim(),
        title: e.title.trim(),
        start_date: e.start_date.trim(),
        end_date: e.end_date.trim(),
        current: e.current,
        description: e.description.trim(),
        achievements: e.achievements.trim(),
        tech: csv(e.tech),
      })),
    projects: f.projects
      .filter((p) => p.title.trim() && p.description.trim())
      .map((p) => ({
        title: p.title.trim(),
        description: p.description.trim(),
        problem: p.problem.trim(),
        tech: csv(p.tech),
        role: p.role.trim(),
        links: { live: p.live.trim(), repo: p.repo.trim(), demo: p.demo.trim() },
        impact: p.impact.trim(),
        users_scale: p.users_scale.trim(),
        hardest_challenge: p.hardest_challenge.trim(),
        personal_contribution: p.personal_contribution.trim(),
        project_type: p.project_type.trim(),
      })),
    oss: f.oss
      .filter((o) => o.repo_name.trim())
      .map((o) => ({
        repo_name: o.repo_name.trim(),
        repo_url: o.repo_url.trim(),
        description: o.description.trim(),
        pr_links: csv(o.pr_links),
        tech: csv(o.tech),
        role: o.role.trim() || "Contributor",
      })),
    education: f.education
      .filter((e) => e.institution.trim())
      .map((e) => ({
        institution: e.institution.trim(),
        degree: e.degree.trim(),
        field: e.field.trim(),
        years: e.years.trim(),
        achievements: e.achievements.trim(),
      })),
    links: {
      github: f.github.trim(),
      linkedin: f.linkedin.trim(),
      portfolio: f.portfolio.trim(),
      resume_url: f.resume_url.trim(),
      extraLinks: f.extraLinks.filter((l) => l.heading.trim() && l.url.trim()).map((l) => ({ heading: l.heading.trim(), url: l.url.trim() })),
    },
    min_salary: Number(f.min_salary) || 0,
    currency: (f.currency.trim() || "INR").toUpperCase().slice(0, 3),
    frequency: f.frequency,
    negotiable: f.negotiable,
    location_pref: f.location_pref.trim(),
    remote_pref: f.remote_pref,
    relocation: f.relocation,
    availability: f.availability.trim() || "Immediate",
    notice_period: f.notice_period.trim(),
    visibility: f.visibility,
    consent: true,
  };
}

const STEPS = [
  { t: "Basics", d: "Who you are" },
  { t: "Profile", d: "Role & skills" },
  { t: "Experience", d: "Where you worked" },
  { t: "Projects", d: "Proof of work" },
  { t: "Background", d: "Education & links" },
  { t: "Private", d: "Matching only" },
  { t: "Review", d: "Ship it" },
];

const AVAIL_PRESETS = ["Immediate", "15 days", "30 days", "60 days", "Inactive"];

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return <GooeySlider label={label} value={value} display={display} min={min} max={max} step={step} onChange={onChange} />;
}

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; t: string }[];
  onChange: (v: T) => void;
}) {
  const segId = useId();
  return (
    <div className="field">
      <label>{label}</label>
      <div className="seg" style={{ position: "relative" }}>
        {options.map((o) => {
          const isActive = value === o.v;
          return (
            <button
              key={o.v}
              type="button"
              className={isActive ? "on" : ""}
              onClick={() => onChange(o.v)}
              style={{ position: "relative", zIndex: 1, background: isActive ? "transparent" : undefined }}
            >
              {isActive ? (
                <motion.div
                  layoutId={`seg-${segId}`}
                  className="seg-active-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "#fff",
                    borderRadius: 6,
                    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
                    zIndex: -1,
                  }}
                />
              ) : null}
              <span style={{ position: "relative" }}>{o.t}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" className="switchrow" onClick={() => onChange(!value)}>
      <span>{label}</span>
      <span className={"switch" + (value ? " on" : "")}>
        <span className="thumb" />
      </span>
    </button>
  );
}

export default function CandidateForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: FormState;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; warnings?: string[] }>;
}) {
  const isEdit = !!initial;
  const [f, setF] = useState<FormState>(initial ?? blankForm());
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(isEdit);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  // Draft autosave (create mode only).
  useEffect(() => {
    if (isEdit) return;
    try {
      const raw = localStorage.getItem("tammy_draft");
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === "object" && d.name) {
          setF({ ...blankForm(), ...d });
          setDraftNote("Draft restored — pick up where you left off.");
        }
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEdit || busy) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("tammy_draft", JSON.stringify(f));
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [f, isEdit, busy]);

  function clearDraft() {
    try {
      localStorage.removeItem("tammy_draft");
    } catch {
      /* ignore */
    }
    setF(blankForm());
    setStep(0);
    setDraftNote(null);
  }

  const emailOk = (v: string) => /.+@.+\..+/.test(v.trim());

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!f.name.trim()) return "Your name is required.";
      if (!emailOk(f.email)) return "A valid email is required — it becomes your contact email automatically.";
      if (!f.location.trim()) return "Your city is required.";
    }
    if (s === 1) {
      if (!f.role.trim()) return "Desired role is required.";
      if (!f.domain.trim()) return "Domain is required.";
      if (!f.skills.length) return "Add at least one skill.";
    }
    if (s === 4) {
      if (!f.resume_url.trim())
        return "Resume is required — paste a Drive share link (preferred) or a file URL.";
      if (!f.phone.trim() && !f.linkedin.trim())
        return "Add a phone number or a LinkedIn URL — either one is required so HR can reach you. GitHub / portfolio never count as contact.";
    }
    return null;
  }

  function go(n: number) {
    if (n > step) {
      const err = validateStep(step);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    setDir(n > step ? 1 : -1);
    setStep(n);
  }

  async function submit() {
    for (let s = 0; s <= 4; s++) {
      const err = validateStep(s);
      if (err) {
        setDir(-1);
        setStep(s);
        setError(err);
        return;
      }
    }
    if (!agreed) {
      setError("Please confirm consent to publish your page.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await onSubmit(formToPayload(f)).catch((err) => ({
      ok: false,
      error: err?.message ?? "submit failed",
    }));
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "submit failed");
      return;
    }
    if (!isEdit) {
      try {
        localStorage.removeItem("tammy_draft");
      } catch {
        /* ignore */
      }
    }
  }

  const reviewRows: [string, string][] = [
    ["Name", f.name || "—"],
    ["Email", f.email || "—"],
    ["Role", f.role || "—"],
    ["Domain", f.domain || "—"],
    ["Experience", `${f.exp} yrs`],
    ["Skills", f.skills.length ? f.skills.join(", ") : "—"],
    ["Jobs", f.experiences.filter((e) => e.company.trim()).length.toString()],
    ["Projects", f.projects.filter((p) => p.title.trim()).length.toString()],
    ["Open source", f.oss.filter((o) => o.repo_name.trim()).length.toString()],
    ["Min salary", f.min_salary > 0 ? `${Number(f.min_salary).toLocaleString()} ${f.currency}/${f.frequency} · private` : "Open"],
  ];

  return (
    <div className="onboard">
      <OnboardingStepper
        steps={STEPS.map((s) => ({ title: s.t, hint: s.d }))}
        current={step}
        onStep={go}
        meta={
          isEdit ? null : (
            <span className="onboard-autosave">
              <i />
              {busy ? "Saving…" : "Autosaved"}
            </span>
          )
        }
      />
      <div className="onboard-helpers">
        <button
          type="button"
          className="onboard-autofill"
          onClick={() => {
            setF(demoForm());
            setError(null);
          }}
        >
          <Sparkles />
          Autofill test data
        </button>
        {!isEdit && draftNote ? (
          <span className="onboard-draft">
            {draftNote}{" "}
            <button type="button" onClick={clearDraft}>
              Discard
            </button>
          </span>
        ) : null}
      </div>

      {error ? <p className="err" style={{ marginBottom: 12 }}>{error}</p> : null}

      <div className="onboard-viewport">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            className="motion-step"
            initial={{ opacity: 0, x: 8 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 * dir }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
          {step === 0 && (
            <div className="form-card">
              <h3>Basics — who you are</h3>
              <p>This is how your page introduces you.</p>
              <div className="grid2">
                <div className="field"><label>Full name *</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Aarav Mehta" /></div>
                <div className="field"><label>Email *</label><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" /><span className="hint">Becomes your contact email automatically.</span></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Phone</label><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91…" /></div>
                <div className="field"><label>City *</label><input className="input" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Bengaluru" /></div>
              </div>
              <div className="field"><label>Photo URL</label><input className="input" value={f.photo_url} onChange={(e) => set("photo_url", e.target.value)} placeholder="https://…" /><span className="hint">Shows as a rounded-square avatar. Upload available after saving.</span></div>
            </div>
          )}

          {step === 1 && (
            <div className="form-card">
              <h3>Profile — role & skills</h3>
              <p>Your professional identity and craft.</p>
              <div className="grid2">
                <div className="field"><label>Desired role *</label><input className="input" value={f.role} onChange={(e) => set("role", e.target.value)} placeholder="Product Designer" /></div>
                <div className="field"><label>Current role</label><input className="input" value={f.current_role} onChange={(e) => set("current_role", e.target.value)} placeholder="Senior Product Designer" /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Headline</label><input className="input" value={f.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Product designer, building in code." /></div>
                <div className="field" style={{ maxWidth: 280 }}><label>Domain *</label><input className="input" value={f.domain} onChange={(e) => set("domain", e.target.value)} placeholder="Design" /></div>
              </div>
              <Slider label="Years of experience" value={f.exp} display={`${f.exp} yrs`} min={0} max={Math.max(30, f.exp)} step={1} onChange={(v) => set("exp", v)} />
              <div className="field">
                <label>Skills * — recognized names only, so matching stays clean</label>
                <SkillPicker value={f.skills} onChange={(v) => set("skills", v)} allowCustom />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-card">
              <h3>Experience — where you worked</h3>
              <p>Each job becomes an accordion card on your page. Add as many as matter.</p>
              {f.experiences.map((e, i) => (
                <div className="itembox" key={i}>
                  <div className="grid2">
                    <div className="field"><label>Company *</label><input className="input" value={e.company} onChange={(ev) => { const a = [...f.experiences]; a[i] = { ...e, company: ev.target.value }; set("experiences", a); }} /></div>
                    <div className="field"><label>Title *</label><input className="input" value={e.title} onChange={(ev) => { const a = [...f.experiences]; a[i] = { ...e, title: ev.target.value }; set("experiences", a); }} /></div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>Start (YYYY-MM)</label><input className="input" value={e.start_date} onChange={(ev) => { const a = [...f.experiences]; a[i] = { ...e, start_date: ev.target.value }; set("experiences", a); }} placeholder="2021-06" /></div>
                    <div className="field"><label>End (YYYY-MM)</label><input className="input" value={e.end_date} disabled={e.current} onChange={(ev) => { const a = [...f.experiences]; a[i] = { ...e, end_date: ev.target.value }; set("experiences", a); }} placeholder="2023-01" /></div>
                  </div>
                  <Toggle label="I currently work here" value={e.current} onChange={(v) => { const a = [...f.experiences]; a[i] = { ...e, current: v }; set("experiences", a); }} />
                  <div className="field"><label>What you did</label><textarea className="textarea" style={{ minHeight: 70 }} value={e.description} onChange={(ev) => { const a = [...f.experiences]; a[i] = { ...e, description: ev.target.value }; set("experiences", a); }} /></div>
                  <div className="field"><label>Achievements</label><input className="input" value={e.achievements} onChange={(ev) => { const a = [...f.experiences]; a[i] = { ...e, achievements: ev.target.value }; set("experiences", a); }} /></div>
                  <div className="field"><label>Tech (comma separated)</label><input className="input" value={e.tech} onChange={(ev) => { const a = [...f.experiences]; a[i] = { ...e, tech: ev.target.value }; set("experiences", a); }} /></div>
                  <button type="button" className="btn-plain" onClick={() => set("experiences", f.experiences.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              <button
                type="button"
                className="btn-frame"
                onClick={() => set("experiences", [...f.experiences, { company: "", title: "", start_date: "", end_date: "", current: false, description: "", achievements: "", tech: "" }])}
              >
                <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                + Add job
              </button>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="form-card">
                <h3>Projects — proof of work</h3>
                <p>Max two per row on your page, with depth badges once analyzed.</p>
                {f.projects.map((p, i) => (
                  <div className="itembox" key={i}>
                    <div className="field"><label>Title *</label><input className="input" value={p.title} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, title: ev.target.value }; set("projects", a); }} /></div>
                    <div className="field"><label>Description *</label><textarea className="textarea" style={{ minHeight: 70 }} value={p.description} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, description: ev.target.value }; set("projects", a); }} /></div>
                    <div className="field"><label>Problem it solved</label><input className="input" value={p.problem} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, problem: ev.target.value }; set("projects", a); }} /></div>
                    <div className="grid2">
                      <div className="field"><label>Tech (comma separated)</label><input className="input" value={p.tech} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, tech: ev.target.value }; set("projects", a); }} /></div>
                      <div className="field"><label>Your role</label><input className="input" value={p.role} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, role: ev.target.value }; set("projects", a); }} /></div>
                    </div>
                    <div className="grid2">
                      <div className="field"><label>Live link</label><input className="input" value={p.live} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, live: ev.target.value }; set("projects", a); }} /></div>
                      <div className="field"><label>Repo link</label><input className="input" value={p.repo} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, repo: ev.target.value }; set("projects", a); }} /></div>
                    </div>
                    <div className="grid2">
                      <div className="field"><label>Impact</label><input className="input" value={p.impact} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, impact: ev.target.value }; set("projects", a); }} /></div>
                      <div className="field"><label>Type</label><select className="select" value={p.project_type} onChange={(ev) => { const a = [...f.projects]; a[i] = { ...p, project_type: ev.target.value }; set("projects", a); }}><option value="">—</option><option value="personal">Personal</option><option value="academic">Academic</option><option value="freelance">Freelance</option><option value="production">Production</option><option value="open_source">Open source</option><option value="prototype">Prototype</option></select></div>
                    </div>
                    <button type="button" className="btn-plain" onClick={() => set("projects", f.projects.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-frame"
                  onClick={() => set("projects", [...f.projects, { title: "", description: "", problem: "", tech: "", role: "", live: "", repo: "", demo: "", impact: "", users_scale: "", hardest_challenge: "", personal_contribution: "", project_type: "" }])}
                >
                  <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                  + Add project
                </button>
              </div>
              <div className="form-card">
                <h3>Open source contributions</h3>
                <p>Their own section on your page — repos, PRs, your role.</p>
                {f.oss.map((o, i) => (
                  <div className="itembox" key={i}>
                    <div className="grid2">
                      <div className="field"><label>Repo name *</label><input className="input" value={o.repo_name} onChange={(ev) => { const a = [...f.oss]; a[i] = { ...o, repo_name: ev.target.value }; set("oss", a); }} placeholder="facebook/react" /></div>
                      <div className="field"><label>Repo URL</label><input className="input" value={o.repo_url} onChange={(ev) => { const a = [...f.oss]; a[i] = { ...o, repo_url: ev.target.value }; set("oss", a); }} placeholder="https://github.com/…" /></div>
                    </div>
                    <div className="field"><label>What you contributed</label><textarea className="textarea" style={{ minHeight: 60 }} value={o.description} onChange={(ev) => { const a = [...f.oss]; a[i] = { ...o, description: ev.target.value }; set("oss", a); }} /></div>
                    <div className="grid2">
                      <div className="field"><label>PR links (comma separated)</label><input className="input" value={o.pr_links} onChange={(ev) => { const a = [...f.oss]; a[i] = { ...o, pr_links: ev.target.value }; set("oss", a); }} /></div>
                      <div className="field"><label>Tech (comma separated)</label><input className="input" value={o.tech} onChange={(ev) => { const a = [...f.oss]; a[i] = { ...o, tech: ev.target.value }; set("oss", a); }} /></div>
                    </div>
                    <button type="button" className="btn-plain" onClick={() => set("oss", f.oss.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-frame"
                  onClick={() => set("oss", [...f.oss, { repo_name: "", repo_url: "", description: "", pr_links: "", tech: "", role: "Contributor" }])}
                >
                  <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                  + Add contribution
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="form-card">
                <h3>Education</h3>
                <p>Shown under background on your page.</p>
                {f.education.map((e, i) => (
                  <div className="itembox" key={i}>
                    <div className="grid2">
                      <div className="field"><label>Institution *</label><input className="input" value={e.institution} onChange={(ev) => { const a = [...f.education]; a[i] = { ...e, institution: ev.target.value }; set("education", a); }} /></div>
                      <div className="field"><label>Degree</label><input className="input" value={e.degree} onChange={(ev) => { const a = [...f.education]; a[i] = { ...e, degree: ev.target.value }; set("education", a); }} /></div>
                    </div>
                    <div className="grid2">
                      <div className="field"><label>Field</label><input className="input" value={e.field} onChange={(ev) => { const a = [...f.education]; a[i] = { ...e, field: ev.target.value }; set("education", a); }} /></div>
                      <div className="field"><label>Years</label><input className="input" value={e.years} onChange={(ev) => { const a = [...f.education]; a[i] = { ...e, years: ev.target.value }; set("education", a); }} placeholder="2018 - 2022" /></div>
                    </div>
                    <button type="button" className="btn-plain" onClick={() => set("education", f.education.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-frame"
                  onClick={() => set("education", [...f.education, { institution: "", degree: "", field: "", years: "", achievements: "" }])}
                >
                  <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                  + Add education
                </button>
              </div>
              <div className="form-card">
                <h3>Links & contact proof</h3>
                <p>Resume required · phone or LinkedIn required · GitHub/portfolio never count as contact.</p>
                <div className="grid2">
                  <div className="field"><label>GitHub</label><input className="input" value={f.github} onChange={(e) => set("github", e.target.value)} placeholder="https://…" /></div>
                  <div className="field"><label>LinkedIn <span className="hint">— or phone, either required</span></label><input className="input" value={f.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="https://…" /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label>Portfolio / website</label><input className="input" value={f.portfolio} onChange={(e) => set("portfolio", e.target.value)} placeholder="https://…" /></div>
                  <div className="field"><label>Resume link * <span className="hint">— Drive preferred</span></label><input className="input" value={f.resume_url} onChange={(e) => set("resume_url", e.target.value)} placeholder="https://drive.google.com/…" /></div>
                </div>
                <AnimatePresence>
                  {f.extraLinks.map((lnk, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="itembox"
                      style={{ position: "relative", paddingTop: 14 }}
                    >
                      <button
                        type="button"
                        onClick={() => set("extraLinks", f.extraLinks.filter((_, j) => j !== i))}
                        className="btn-plain"
                        style={{ position: "absolute", top: 10, right: 12, fontSize: 11, color: "#8A96A8" }}
                        aria-label="Remove link"
                      >
                        Remove ✕
                      </button>
                      <div className="grid2" style={{ gap: 12 }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Name</label>
                          <input
                            className="input"
                            value={lnk.heading}
                            onChange={(e) => {
                              const a = [...f.extraLinks];
                              a[i] = { ...lnk, heading: e.target.value };
                              set("extraLinks", a);
                            }}
                            placeholder="e.g. Twitter, Behance"
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Link</label>
                          <input
                            className="input"
                            value={lnk.url}
                            onChange={(e) => {
                              const a = [...f.extraLinks];
                              a[i] = { ...lnk, url: e.target.value };
                              set("extraLinks", a);
                            }}
                            placeholder="https://…"
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div style={{ marginTop: f.extraLinks.length ? 4 : 12 }}>
                  <p className="hint" style={{ marginBottom: f.extraLinks.length ? 10 : 8 }}>
                    {f.extraLinks.length ? "Add as many as you need — each shows as a pill on your page." : "Got a Behance, Dribbble, Twitter, or personal site? Add it here."}
                  </p>
                  <button
                    type="button"
                    className="btn-frame"
                    onClick={() => set("extraLinks", [...f.extraLinks, { heading: "", url: "" }])}
                  >
                    <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
                    + Add link
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <div className="form-card">
              <h3>Private — matching only</h3>
              <p>Never shown on your public page. Editable anytime.</p>
              <div className="grid-pair">
                <div className="field">
                  <label>Currency</label>
                  <select className="select" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                    <option value="INR">INR — Indian Rupee</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="JPY">JPY — Japanese Yen</option>
                    <option value="AUD">AUD — Australian Dollar</option>
                    <option value="CAD">CAD — Canadian Dollar</option>
                    <option value="SGD">SGD — Singapore Dollar</option>
                    <option value="AED">AED — UAE Dirham</option>
                    <option value="CHF">CHF — Swiss Franc</option>
                  </select>
                </div>
                <div className="field">
                  <label>Amount</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    value={f.min_salary ? String(f.min_salary) : ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      set("min_salary", v ? Number(v) : 0);
                    }}
                    placeholder="e.g. 50000"
                  />
                </div>
              </div>
              <p className="hint" style={{ marginTop: 6 }}>Set your expected amount — choose currency first, then number.</p>
              <div className="field">
                <label>Open to locations</label>
                <SkillPicker
                  value={f.location_pref ? f.location_pref.split(",").map((s) => s.trim()).filter(Boolean) : []}
                  onChange={(vals) => set("location_pref", vals.join(", "))}
                  placeholder="Search locations…"
                  options={[...LOCATIONS]}
                  suggestions={[...LOCATIONS.slice(0, 10)]}
                  allowCustom
                />
                <p className="hint">Pick one or more — like skills, searchable with chips. Type any city to add it as Other.</p>
              </div>
              <Seg label="Work mode" value={f.remote_pref} options={[{ v: "remote", t: "Remote" }, { v: "hybrid", t: "Hybrid" }, { v: "onsite", t: "Onsite" }]} onChange={(v) => set("remote_pref", v)} />
              <div className="field">
                <label>Notice period</label>
                <div className="chips" style={{ marginBottom: 10 }}>
                  {AVAIL_PRESETS.map((a) => (
                    <motion.button
                      key={a}
                      type="button"
                      className={"chipbtn" + (f.availability === a ? " on" : "")}
                      onClick={() => set("availability", a)}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    >
                      {a}
                    </motion.button>
                  ))}
                </div>
                <div className="grid-pair-sm">
                  <div className="field">
                    <select
                      className="select"
                      aria-label="Notice period unit"
                      value={(() => {
                        const m = f.availability.match(/^\d+\s*(.*)/);
                        if (m && m[1]) {
                          const u = m[1].toLowerCase();
                          if (u.includes("day")) return "days";
                          if (u.includes("week")) return "weeks";
                          if (u.includes("month")) return "months";
                          if (u.includes("year")) return "years";
                          return "days";
                        }
                        return "days";
                      })()}
                      onChange={(e) => {
                        const numMatch = f.availability.match(/^(\d+)/);
                        const num = numMatch ? numMatch[1] : "15";
                        set("availability", `${num} ${e.target.value}`);
                      }}
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </div>
                  <div className="field">
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      aria-label="Notice period number"
                      value={(() => {
                        const m = f.availability.match(/^(\d+)\s*(.*)/);
                        return m ? m[1] : f.availability === "Immediate" || f.availability === "Inactive" ? "" : f.availability;
                      })()}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "");
                        const unitMatch = f.availability.match(/^\d+\s*(.*)/);
                        const unit = unitMatch ? unitMatch[1] : "days";
                        if (!v) {
                          set("availability", unit ? `0 ${unit}` : "Immediate");
                        } else {
                          set("availability", `${v} ${unit || "days"}`);
                        }
                      }}
                      placeholder="15"
                    />
                  </div>
                </div>
                <p className="hint" style={{ marginTop: 6 }}>Enter a number and pick the unit — e.g., 15 days, 2 months.</p>
              </div>
              <Seg label="Page visibility" value={f.visibility} options={[{ v: "visible", t: "Visible" }, { v: "hidden", t: "Hidden" }, { v: "inactive", t: "Inactive" }]} onChange={(v) => set("visibility", v)} />
            </div>
          )}

          {step === 6 && (
            <div className="form-card">
              <h3>Review — does this look right?</h3>
              <p>Your page renders exactly this. Private rows stay hidden.</p>
              <div className="review">
                {reviewRows.map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
              <label className="consent">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                I consent to publishing this page and being contacted about matching roles.
              </label>
            </div>
          )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="onboard-nav">
        {step > 0 ? (
          <button type="button" className="onboard-back" onClick={() => go(step - 1)}>
            <ArrowLeft />
            Back
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" className="onboard-next" onClick={() => go(step + 1)}>
            Continue
            <ArrowRight />
          </button>
        ) : (
          <button type="button" className="onboard-next onboard-publish" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
