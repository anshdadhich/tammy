"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
} from "lucide-react";
import DitherEffect from "@/components/DitherEffect";
import AppNav from "@/components/AppNav";
import BeamButton from "@/components/BeamButton";
import { AnimatePresence, motion } from "motion/react";
import { getSession } from "@/lib/session";

/* ─── Data ─── */

const CHECKLIST_STEPS = [
  "Parse brief",
  "Embed query",
  "Hybrid retrieval",
  "Score 5 dimensions",
  "Deep Read judge",
  "Unlock contact",
];

const FAQS = [
  {
    q: "How is Tammy fundamentally different from LinkedIn or standard job boards?",
    a: "Traditional boards incentivize candidates to spam 200 keyword-stuffed resumes into black-box ATS filters. On Tammy, you build a single, comprehensive engineering record backed by concrete artifacts (PRs, benchmarks, architecture decisions). Employers search semantically for what you built, and reach out directly with verified context.",
  },
  {
    q: "Can my current employer see that I have an active profile on Tammy?",
    a: "No. You can block specific domain names, corporate entities, or current employers with a single toggle. Additionally, there is no public candidate listing; only accredited, vetted hiring teams running calibrated searches can query indexed candidate signals.",
  },
  {
    q: 'What is the "Deep Read Judge" and how are scores formed?',
    a: "The Deep Read Judge is a structured reasoning model that inspects technical contributions across 5 distinct axes: system scale, architectural depth, operational evidence, verified metrics, and verified seniority. It does not output a mysterious vanity score—it gives the hiring manager written exhibits and specific suggested questions.",
  },
  {
    q: "Is Tammy completely free for engineers and builders?",
    a: "Yes, 100% free forever for candidates. Tammy monetizes strictly on the employer side through search subscriptions and successful placement guarantees. We never charge candidates for visibility, priority indexing, or unlocking offers.",
  },
];

const PIPELINE = [
  {
    n: "01",
    nClass: "text-[#1F2DE6]",
    title: "Filter",
    desc: "Hard constraints, availability, and compensation requirements.",
    fill: "88%",
    fillBg: "#1F2DE6",
  },
  {
    n: "02",
    nClass: "text-purple-600",
    title: "Vectors",
    desc: "Every meaningful project chunk becomes semantically searchable.",
    fill: "74%",
    fillBg: "#1F2DE6",
  },
  {
    n: "03",
    nClass: "text-orange-600",
    title: "Score",
    desc: "Depth of technical contribution and evidence credibility.",
    fill: "91%",
    fillBg: "#ea580c",
  },
  {
    n: "04",
    nClass: "text-green-600",
    title: "Judge",
    desc: "Evaluates fit, flags gaps, and calibrates interview questions.",
    fill: "82%",
    fillBg: "#16a34a",
  },
];

const DISCOVERY = [
  {
    n: "01",
    dot: "bg-[#1F2DE6]",
    title: "Describe",
    desc: '"Senior backend engineer who has shipped distributed systems."',
  },
  {
    n: "02",
    dot: "bg-purple-600",
    title: "Search",
    desc: "Relevant experience and project chunks are retrieved.",
  },
  {
    n: "03",
    dot: "bg-orange-600",
    title: "Evaluate",
    desc: "Evidence depth and verified metrics shape candidate ranking.",
  },
  {
    n: "04",
    dot: "bg-green-600",
    title: "Understand",
    desc: "Verdicts, exhibits, gaps, and calibrated questions.",
  },
  {
    n: "05",
    dot: "bg-pink-600",
    title: "Contact",
    desc: "Reach out directly with full audit-logging on both sides.",
  },
];

/* ─── Scroll-reveal wrapper ─── */

function Reveal({
  className = "",
  stagger = 0,
  children,
}: {
  className?: string;
  stagger?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -70px 0px", threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal-blur ${stagger ? `stagger-${stagger}` : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ─── Trace fill bar (animates when visible) ─── */

function TraceFill({ width, bg }: { width: string; bg: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const fill = entry.target.querySelector(".trace-fill") as HTMLElement | null;
            if (fill) setTimeout(() => (fill.style.width = width), 120);
            obs.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -70px 0px", threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [width]);

  return (
    <div ref={ref} className="trace-rule">
      <div className="trace-fill" style={{ background: bg }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */

export default function Landing() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<string[]>(() =>
    CHECKLIST_STEPS.map((_, i) => (i < 3 ? "done" : i === 3 ? "running" : "queued")),
  );
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [matchMode, setMatchMode] = useState<"describe" | "search" | "deep">("search");
  const runningRef = useRef(false);

  // Recruiter home is /hire — logged-in employers skip the landing page.
  useEffect(() => {
    try {
      if (getSession().kind === "hr") router.replace("/hire");
    } catch {
      /* ignore */
    }
  }, [router]);

  const MATCH_COPY = {
    describe: {
      title: "Describe the role, not a query.",
      desc: "Write how you'd brief a teammate — stack, scope, constraints, and seniority. No Boolean gymnastics. Tammy parses intent, not keywords, and surfaces evidence that matches meaning.",
    },
    search: {
      title: "It explains every score.",
      desc: "Semantic fit, skill evidence, project depth, constraints and seniority — each weighed from what people actually built, not what they claimed. Every value is real and inspectable, so what lands is a shortlist, not a guess.",
    },
    deep: {
      title: "Deep Read judges the evidence.",
      desc: "For the top profiles, the judge reads full context — written exhibits, gaps, and risks — then calibrates interview questions. Slower, sharper, and audit-logged so hiring stays accountable.",
    },
  } as const;

  const runChecklist = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatuses(CHECKLIST_STEPS.map(() => "queued"));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setStatuses(
        CHECKLIST_STEPS.map((_, j) =>
          j < i ? "done" : j === i ? "running" : "queued",
        ),
      );
      if (i >= CHECKLIST_STEPS.length) {
        clearInterval(timer);
        runningRef.current = false;
      }
    }, 380);
  }, []);

  return (
    <div className="relative min-h-screen bg-paper text-ink antialiased selection:bg-[#1F2DE6] selection:text-white">
      {/* Vertical guidelines */}
      <div className="g-v g-v-l hidden lg:block" />
      <div className="g-v g-v-r hidden lg:block" />

      {/* ================= HEADER ================= */}
      <AppNav />

      {/* ================= HERO ================= */}
      <section id="top" className="relative pt-16 pb-20 overflow-hidden">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[1160px] mx-auto px-6">
          <Reveal className="mb-14">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.06] text-ink">
              Candidates don&apos;t apply.
              <br />
              Employers discover them.
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-7">
              <BeamButton>
                <Link
                  href="/start"
                  className="press rounded-lg bg-[#1F2DE6] hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 shadow-sm inline-block"
                >
                  Build my page
                </Link>
              </BeamButton>
              <Link
                href="/hire"
                className="press rounded-lg bg-white border border-slate-300 hover:border-slate-400 text-sm font-semibold px-5 py-2.5 flex items-center gap-1.5 shadow-sm"
              >
                I&apos;m hiring <ArrowRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
            {/* Dither panel with checklist */}
            <Reveal className="lg:col-span-3 relative" stagger={1}>
              <i className="g-handle -top-1 -left-1" />
              <i className="g-handle -top-1 -right-1" />
              <i className="g-handle -bottom-1 -left-1" />
              <i className="g-handle -bottom-1 -right-1" />

              <div className="relative bg-[#1F2DE6] p-8 sm:p-12 overflow-hidden shadow-md">
                <div className="absolute inset-0">
                  <DitherEffect colorFront="#1F2DE6" colorBack="#ffffff" scale={0.8} className="dither-soft" />
                </div>

                <div className="relative rounded-lg bg-[#F4F5F7] shadow-lg px-6 py-6 sm:px-8 sm:py-7 border border-white/60">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-4 font-mono">
                    <span>MATCHING YOUR BRIEF</span>
                    <span className="text-[#1F2DE6] flex items-center gap-1.5 font-sans font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1F2DE6] pulse-dot" /> Active query
                    </span>
                  </div>
                  <div className="space-y-3">
                    {CHECKLIST_STEPS.map((label, i) => {
                      const s = statuses[i];
                      return (
                        <div key={label} className="flex items-center justify-between">
                          <span className={`flex items-center gap-2.5 text-[13px] ${s === "queued" ? "text-slate-400" : "text-slate-800"}`}>
                            {s === "done" ? (
                              <Check className="w-3.5 h-3.5 text-[#1F2DE6]" aria-hidden="true" />
                            ) : s === "running" ? (
                              <span className="w-2 h-2 rounded-full bg-[#1F2DE6] pulse-dot inline-block" />
                            ) : (
                              <span className="w-2 h-2 rounded-full border border-slate-300 inline-block" />
                            )}
                            {label}
                          </span>
                          {s === "done" ? (
                            <span className="font-mono text-[11px] text-slate-400">done</span>
                          ) : s === "running" ? (
                            <span className="font-mono text-[11px] text-[#1F2DE6]">running…</span>
                          ) : (
                            <span className="font-mono text-[11px] text-slate-300">queued</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Right column */}
            <Reveal className="lg:col-span-2 lg:pt-1" stagger={2}>
              <div className="match-controls">
                <div className="match-mode-switcher">
                  <button
                    onClick={() => setMatchMode("describe")}
                    className={`match-mode ${matchMode === "describe" ? "is-active" : ""}`}
                    aria-pressed={matchMode === "describe"}
                    style={{ position: "relative" }}
                  >
                    {matchMode === "describe" ? (
                      <motion.span
                        layoutId="match-mode-pill"
                        className="match-mode-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    ) : null}
                    <span style={{ position: "relative" }}>Describe role</span>
                  </button>
                  <button
                    onClick={() => {
                      setMatchMode("search");
                      runChecklist();
                    }}
                    className={`match-mode ${matchMode === "search" ? "is-active" : ""}`}
                    aria-pressed={matchMode === "search"}
                    style={{ position: "relative" }}
                  >
                    {matchMode === "search" ? (
                      <motion.span
                        layoutId="match-mode-pill"
                        className="match-mode-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    ) : null}
                    <span style={{ position: "relative" }}>Search</span>
                  </button>
                  <button
                    onClick={() => setMatchMode("deep")}
                    className={`match-mode ${matchMode === "deep" ? "is-active" : ""}`}
                    aria-pressed={matchMode === "deep"}
                    style={{ position: "relative" }}
                  >
                    {matchMode === "deep" ? (
                      <motion.span
                        layoutId="match-mode-pill"
                        className="match-mode-pill"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    ) : null}
                    <span style={{ position: "relative" }}>Deep Read</span>
                  </button>
                </div>
                <button
                  onClick={() => {
                    if (matchMode !== "search") setMatchMode("search");
                    runChecklist();
                  }}
                  title="Re-run matching query"
                  className="match-run press"
                >
                  <ArrowRight className="w-4 h-4 text-ink" aria-hidden="true" />
                </button>
              </div>

              <div className="relative mt-10 min-h-[88px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={matchMode}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <h3 className="text-lg font-bold tracking-tight">{MATCH_COPY[matchMode].title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600 mt-2">{MATCH_COPY[matchMode].desc}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= 01 — THE PROBLEM ================= */}
      <section className="guide-h relative py-20">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[1160px] mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-mono text-[#1F2DE6] uppercase tracking-wider mb-3">
              01 — The problem
            </div>
            <h2 className="text-3xl sm:text-[34px] font-bold tracking-tight text-ink mb-3">
              Hiring is backwards.
            </h2>
            <p className="text-[15px] text-slate-600 max-w-xl">
              Candidates repeatedly rewrite the same story for hundreds of applications. Employers
              receive stacks of resumes optimized for keywords, not evidence.
            </p>
          </Reveal>

          <div className="border-b border-dashed border-[#C9CED6] mt-6 mb-12" />

          <div className="grid md:grid-cols-2 gap-6">
            <Reveal className="rounded-lg bg-white border border-slate-200 p-7 hover-lift card-shadow" stagger={1}>
              <div className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Candidate
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-3">Apply. Rewrite. Repeat.</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                The strongest candidates spend their time formatting applications instead of
                building. Every company asks for the same information in a slightly different box.
              </p>

              <div className="mt-6 space-y-2">
                <div className="h-10 border border-slate-200 rounded-md bg-slate-50 flex items-center justify-between px-3 text-xs text-slate-600">
                  <span>Application #142 · Staff Engineer</span>
                  <span className="text-slate-400 font-mono">Awaiting review</span>
                </div>
                <div className="h-10 border border-slate-200 rounded-md bg-slate-50 flex items-center justify-between px-3 text-xs text-slate-600 opacity-65">
                  <span>Application #141 · Systems Engineer</span>
                  <span className="text-orange-500 font-mono">Filtered</span>
                </div>
                <div className="h-10 border border-slate-200 rounded-md bg-slate-50 flex items-center justify-between px-3 text-xs text-slate-600 opacity-35">
                  <span>Application #140 · Backend Lead</span>
                  <span className="text-slate-400 font-mono">Unread</span>
                </div>
              </div>
            </Reveal>

            <Reveal className="rounded-lg bg-white border border-[#1F2DE6]/30 p-7 relative hover-lift card-shadow" stagger={2}>
              <i className="g-handle -top-1 -left-1" />
              <i className="g-handle -top-1 -right-1" />
              <i className="g-handle -bottom-1 -left-1" />
              <i className="g-handle -bottom-1 -right-1" />

              <div className="text-[11px] font-mono font-semibold text-[#1F2DE6] uppercase tracking-wider mb-3">
                Tammy
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-3">Prove it once.</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Candidates create one evidence-backed profile. Tammy turns projects, experience, and
                proof into a structured talent signal employers can search.
              </p>

              <div className="flex flex-wrap gap-2 mt-6">
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-purple-50 text-purple-700 border border-purple-200">EXPERIENCE</span>
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-blue-50 text-[#1F2DE6] border border-blue-200">PROJECTS</span>
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">PROOF</span>
                <span className="text-[11px] font-mono px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200">TERMS</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= 02 — CANDIDATE WIZARD ================= */}
      <section id="candidates" className="guide-h relative py-20">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[1160px] mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-mono text-[#1F2DE6] uppercase tracking-wider mb-3">
              02 — Candidate
            </div>
            <h2 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-3">
              Build your talent record once.
            </h2>
            <p className="text-[15px] text-slate-600 max-w-xl">
              Four steps. Autosaved drafts. Real evidence. Your resume stays in your hands. Review
              everything before your profile becomes discoverable.
            </p>
          </Reveal>

          <div className="border-b border-dashed border-[#C9CED6] mt-6 mb-12" />

          <Reveal className="grid md:grid-cols-[240px_1fr] border border-slate-200 rounded-lg bg-white overflow-hidden card-shadow" stagger={1}>
            <div className="p-6 border-r border-slate-200 bg-slate-50">
              <div className="text-sm font-bold mb-1">Your profile</div>
              <div className="text-xs text-slate-500 mb-6 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Saved automatically
              </div>

              <div className="space-y-3">
                {["Basics", "Profile & skills", "Proof", "Resume & terms"].map((label, i) => {
                  const active = i === 2;
                  return (
                    <div
                      key={label}
                      className={`flex items-center gap-2 text-sm ${active ? "text-ink font-semibold" : "text-slate-600"}`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono ${
                          active
                            ? "bg-[#1F2DE6] text-white shadow-sm"
                            : "bg-slate-100 border border-slate-300"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6">
              <h4 className="text-base font-bold mb-1">Show what you built.</h4>
              <p className="text-xs text-slate-500 mb-5">Evidence makes the profile useful.</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">PROJECT</div>
                  <div className="text-xs font-semibold">Distributed inference service</div>
                </div>
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">ROLE</div>
                  <div className="text-xs font-semibold">Lead Engineer</div>
                </div>
                <div className="col-span-2 border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">
                    WHAT DID YOU ACTUALLY DO?
                  </div>
                  <div className="text-xs font-semibold">
                    Reduced inference latency by 41% across production workloads.
                  </div>
                </div>
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">EVIDENCE</div>
                  <div className="text-xs font-semibold">GitHub · Benchmarks</div>
                </div>
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">IMPACT</div>
                  <div className="text-xs font-semibold">41% faster throughput</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= 03 — INTELLIGENCE PIPELINE ================= */}
      <section id="engine" className="guide-h relative py-20">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[1160px] mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-mono text-[#1F2DE6] uppercase tracking-wider mb-3">
              03 — Intelligence
            </div>
            <h2 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-3">
              The pipeline reads like a hiring manager.
            </h2>
            <p className="text-[15px] text-slate-600 max-w-xl">
              Tammy doesn&apos;t turn candidates into mysterious AI scores. It builds a factual,
              evidence-linked representation of the work behind the resume.
            </p>
          </Reveal>

          <div className="border-b border-dashed border-[#C9CED6] mt-6 mb-12" />

          <Reveal className="border border-slate-200 rounded-lg bg-white p-6 card-shadow" stagger={1}>
            <div className="flex flex-wrap justify-between items-center gap-2 pb-5 border-b border-slate-200 mb-5">
              <div>
                <div className="text-[10px] font-mono text-slate-400">LIVE SEARCH TRACE</div>
                <div className="text-sm font-bold mt-0.5">
                  Backend engineer · distributed systems
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600" /> 30 candidates found
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {PIPELINE.map((p) => (
                <div key={p.n} className="p-2 rounded-md hover:bg-slate-50/60 transition-colors">
                  <span className={`text-[11px] font-mono font-bold ${p.nClass}`}>{p.n}</span>
                  <h5 className="text-sm font-bold mt-1.5 mb-1">{p.title}</h5>
                  <p className="text-xs text-slate-600 leading-relaxed">{p.desc}</p>
                  <TraceFill width={p.fill} bg={p.fillBg} />
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= 04 — DISCOVERY FLOW ================= */}
      <section className="guide-h relative py-20">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[1160px] mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-mono text-[#1F2DE6] uppercase tracking-wider mb-3">
              04 — Discovery
            </div>
            <h2 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-3">
              Describe the person. Don&apos;t write a Boolean query.
            </h2>
            <p className="text-[15px] text-slate-600 max-w-xl">
              An employer describes the role in natural language. Tammy searches structured
              experience, project evidence, and semantic representations.
            </p>
          </Reveal>

          <div className="border-b border-dashed border-[#C9CED6] mt-6 mb-12" />

          <Reveal
            className="discovery-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border border-slate-200 rounded-lg bg-white overflow-hidden card-shadow divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
            stagger={1}
          >
            {DISCOVERY.map((d) => (
              <div key={d.n} className="discovery-card p-5 hover:bg-slate-50/50 transition-colors">
                <span className="text-[10px] font-mono text-slate-400">{d.n}</span>
                <div className="discovery-card-body">
                  <div className={`discovery-dot ${d.dot}`} />
                  <div>
                    <h5 className="text-sm font-bold mb-1">{d.title}</h5>
                    <p className="text-xs text-slate-600 leading-relaxed">{d.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ================= 05 — DOSSIER ================= */}
      <section className="guide-h relative py-20">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[1160px] mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-mono text-[#1F2DE6] uppercase tracking-wider mb-3">
              05 — The output
            </div>
            <h2 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-3">
              Not another resume. A candidate dossier.
            </h2>
            <p className="text-[15px] text-slate-600 max-w-xl">
              The result gives a hiring manager enough context to decide whether a conversation is
              worth having—without pretending the system knows more than the evidence says.
            </p>
          </Reveal>

          <div className="border-b border-dashed border-[#C9CED6] mt-6 mb-12" />

          <Reveal className="grid md:grid-cols-[280px_1fr] border border-slate-200 rounded-lg bg-white overflow-hidden card-shadow" stagger={1}>
            <div className="p-6 border-r border-slate-200 bg-slate-50">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-[#1F2DE6] text-white font-bold text-sm flex items-center justify-center mb-3 shadow-sm">
                AK
              </div>
              <div className="text-base font-bold">Alex Kim</div>
              <div className="text-xs text-slate-600 mt-0.5">Backend · Infrastructure · AI</div>

              <div className="flex flex-wrap gap-1.5 mt-5">
                {["Python", "Distributed Systems", "Kubernetes", "PostgreSQL"].map((s) => (
                  <span
                    key={s}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
                  >
                    {s}
                  </span>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-200">
                <div className="text-[10px] font-mono text-slate-400">AVAILABILITY</div>
                <div className="text-xs font-semibold mt-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 30 days · Remote
                </div>
              </div>
            </div>

            <div className="p-6 space-y-3">
              <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold">Distributed inference service</span>
                  <span className="text-[10px] font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                    PROJECT
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Designed and shipped a production inference layer handling high-volume model
                  requests with 41% latency reduction.
                </p>
              </div>

              <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold">Why this candidate</span>
                  <span className="text-[10px] font-mono font-bold text-[#1F2DE6] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                    JUDGE
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Strong overlap with distributed systems requirements. Evidence supports production
                  ownership. Limited evidence of people management.
                </p>
              </div>

              <div className="border border-slate-200 rounded-md p-4 bg-white hover-lift">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold">Suggested interview questions</span>
                  <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                    NEXT
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Ask how the inference architecture handled failure recovery and how the latency
                  improvement was measured.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= 06 — TRUST ================= */}
      <section className="guide-h relative py-20">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[1160px] mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-mono text-[#1F2DE6] uppercase tracking-wider mb-3">
              06 — Trust
            </div>
            <h2 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-3">
              Discovery without giving up control.
            </h2>
            <p className="text-[15px] text-slate-600 max-w-xl">
              Talent discovery only works if candidates trust the system. Privacy, control, and
              accountability are part of the product.
            </p>
          </Reveal>

          <div className="border-b border-dashed border-[#C9CED6] mt-6 mb-12" />

          <div className="grid md:grid-cols-3 gap-4">
            <Reveal className="border border-slate-200 rounded-lg p-6 bg-white hover-lift card-shadow" stagger={1}>
              <div className="text-xl mb-3 text-[#1F2DE6] font-mono">◇</div>
              <h5 className="text-sm font-bold mb-2">Private by design</h5>
              <p className="text-xs text-slate-600 leading-relaxed">
                No public candidate directory. Employers are verified before they can discover
                talent.
              </p>
            </Reveal>

            <Reveal className="border border-slate-200 rounded-lg p-6 bg-white hover-lift card-shadow" stagger={2}>
              <div className="text-xl mb-3 text-purple-600 font-mono">◌</div>
              <h5 className="text-sm font-bold mb-2">Candidate control</h5>
              <p className="text-xs text-slate-600 leading-relaxed">
                Candidates control visibility, portfolio links, and can delete or export their
                profile at any time.
              </p>
            </Reveal>

            <Reveal className="border border-slate-200 rounded-lg p-6 bg-white hover-lift card-shadow" stagger={3}>
              <div className="text-xl mb-3 text-green-600 font-mono">✓</div>
              <h5 className="text-sm font-bold mb-2">Accountable contact</h5>
              <p className="text-xs text-slate-600 leading-relaxed">
                Contact is direct for speed, while every profile view and inquiry is transparently
                audit-logged.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= 07 — FAQ ================= */}
      <section id="faq" className="guide-h relative py-20">
        <i className="g-handle pos-tl hidden lg:block" />
        <i className="g-handle pos-tr hidden lg:block" />

        <div className="max-w-[920px] mx-auto px-6">
          <Reveal>
            <div className="faq-heading text-center max-w-2xl mx-auto">
            <div className="text-[11px] font-mono text-[#1F2DE6] uppercase tracking-wider mb-3">
              07 — Clarity
            </div>
            <h2 className="text-3xl sm:text-[34px] font-bold tracking-tight mb-3">
              Frequently asked questions.
            </h2>
            <p className="text-[15px] text-slate-600 max-w-xl">
              Everything you need to know about the reverse discovery model, privacy guarantees, and
              evaluation pipeline.
            </p>
            </div>
          </Reveal>

          <div className="border-b border-dashed border-[#C9CED6] mt-8 mb-8 max-w-2xl mx-auto" />

          <Reveal className="faq-list max-w-2xl mx-auto w-full" stagger={1}>
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  className="faq-item"
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="faq-trigger"
                    aria-expanded={open}
                  >
                    <span>{f.q}</span>
                    <span className="faq-trigger-ico">
                      <ChevronDown
                        className="w-4 h-4 shrink-0 transition-transform duration-200"
                        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                  <div className={`faq-body ${open ? "open" : ""}`}>
                    <div>
                      <p>
                        {f.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer id="start" className="footer-simple guide-h relative">
        <div className="footer-simple-shell">
          <div className="footer-simple-frame">
            <i className="g-handle -top-1 -left-1" />
            <i className="g-handle -top-1 -right-1" />
            <i className="g-handle -bottom-1 -left-1" />
            <i className="g-handle -bottom-1 -right-1" />
          <div className="footer-simple-blue">
            <div className="footer-simple-dither" aria-hidden="true">
              <DitherEffect colorFront="#1F2DE6" colorBack="#ffffff" scale={0.8} className="dither-soft" />
            </div>
            <div className="footer-simple-card">
              <div className="footer-simple-grid">
                <div className="footer-simple-brandblock">
                  <a href="#top" className="footer-simple-logo">Tammy</a>
                  <div className="footer-simple-visit">
                    <span className="footer-simple-pill">Start here</span>
                    <Link href="/start" className="footer-simple-cta press">
                      Build my page
                    </Link>
                    <a href="mailto:hiya@tammy.sh" className="footer-simple-mail">hiya@tammy.sh</a>
                  </div>
                </div>
                <nav className="footer-simple-col" aria-label="Talent">
                  <p className="footer-simple-h">Talent</p>
                  <a href="#candidates">Candidates</a>
                  <a href="#engine">How it works</a>
                  <a href="#faq">FAQ</a>
                </nav>
                <nav className="footer-simple-col" aria-label="Hiring">
                  <p className="footer-simple-h">Hiring</p>
                  <Link href="/hire">Employers</Link>
                  <a href="#engine">Search</a>
                  <a href="#faq">Deep Read</a>
                  <Link href="/start">Shop all</Link>
                </nav>
              </div>
            </div>
          </div>
          </div>
          <div className="footer-simple-bottom">
            <span>© 2026 Tammy Technologies Inc.</span>
            <nav aria-label="Legal"><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Security</a></nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
