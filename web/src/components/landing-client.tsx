"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";

/* ─── Scroll-reveal wrapper (IntersectionObserver island) ─── */

export function Reveal({
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-visible");
      return;
    }
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

export function TraceFill({ width, bg }: { width: string; bg: string }) {
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

/* ─── Hero demo: matching checklist + Describe/Search/Deep switcher ─── */

const CHECKLIST_STEPS = [
  "Parse brief",
  "Embed query",
  "Hybrid retrieval",
  "Score 5 dimensions",
  "Deep Read judge",
  "Unlock contact",
];

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

export function HeroDemo({ dither }: { dither: React.ReactNode }) {
  const [statuses, setStatuses] = useState<string[]>(() =>
    CHECKLIST_STEPS.map((_, i) => (i < 3 ? "done" : i === 3 ? "running" : "queued")),
  );
  const [matchMode, setMatchMode] = useState<"describe" | "search" | "deep">("search");
  const runningRef = useRef(false);

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
    <div className="grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
      {/* Dither panel with checklist */}
      <Reveal className="lg:col-span-3 relative" stagger={1}>
        <div className="relative rounded-xl bg-[#1F2DE6] p-8 sm:p-12 overflow-hidden shadow-md">
          <div className="absolute inset-0">{dither}</div>

          <div className="relative rounded-xl bg-[#F4F5F7] shadow-lg px-6 py-6 sm:px-8 sm:py-7 border border-white/60">
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
            aria-label="Re-run matching query"
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
  );
}

/* ─── FAQ accordion ─── */

export function FaqList({ faqs }: { faqs: { q: string; a: string }[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <div className="faq-list max-w-2xl mx-auto w-full">
      {faqs.map((f, i) => {
        const open = openFaq === i;
        return (
          <div key={i} className="faq-item">
            <button
              onClick={() => setOpenFaq(open ? null : i)}
              className="faq-trigger"
              aria-expanded={open}
              aria-controls={`faq-panel-${i}`}
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
            <div className={`faq-body ${open ? "open" : ""}`} id={`faq-panel-${i}`} role="region">
              <div>
                <p>{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
