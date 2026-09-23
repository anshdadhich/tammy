import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import PageShell from "@/components/PageShell";
import BeamButton from "@/components/BeamButton";
import { TraceFill } from "@/components/landing-client";

export const metadata: Metadata = {
  title: "For employers",
  description:
    "Describe the hire, read the scored shortlist, judge the finalists with Deep Read, and reach out with the contact logged.",
};

const STEPS = [
  {
    title: "Write the brief",
    body: "Title, must-haves, constraints — the same five minutes you'd spend briefing a recruiter, in plain sentences.",
  },
  {
    title: "Read the shortlist",
    body: "Every candidate arrives with one score split five ways, plus the skills and projects that produced it.",
  },
  {
    title: "Judge the finalists",
    body: "Deep Read runs the top matches through a judge that marks gaps, risks, and the questions worth asking.",
  },
  {
    title: "Reach out on the record",
    body: "Shortlists and contacts are logged, so accountability doesn't evaporate after the hire.",
  },
];

const WEIGHTS = [
  { label: "Semantic fit", pct: 25 },
  { label: "Skill evidence", pct: 25 },
  { label: "Project depth", pct: 20 },
  { label: "Constraints", pct: 15 },
  { label: "Seniority", pct: 10 },
];

const MOCK_ROWS = [
  { initials: "MK", name: "Frontend engineer · 7 yrs · Bengaluru", score: 84 },
  { initials: "AV", name: "Design systems lead · 9 yrs · Remote", score: 76 },
];

export default function HirePage() {
  return (
    <PageShell active="/hire">
      {/* Hero */}
      <section className="pt-20 lg:pt-28 pb-16">
        <div className="max-w-[1160px] mx-auto px-6">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h1
                className="rise text-[clamp(2.5rem,5.6vw,4.25rem)] font-semibold tracking-[-0.03em] leading-[1.05] text-ink"
                style={{ "--d": "60ms" } as React.CSSProperties}
              >
                Describe the person you need.
              </h1>
              <p
                className="rise mt-6 text-[17px] leading-[1.6] text-muted max-w-[540px]"
                style={{ "--d": "160ms" } as React.CSSProperties}
              >
                No Boolean strings, no resume keyword lottery. Write the brief
                the way you&apos;d write it for a teammate, read the evidence each
                match is scored on, and let Deep Read judge the finalists.
              </p>
              <div
                className="rise flex flex-wrap items-center gap-3 mt-8"
                style={{ "--d": "160ms" } as React.CSSProperties}
              >
                <BeamButton>
                  <Link href="/hire/search" className="btn btn-primary press">
                    <Search size={16} aria-hidden="true" /> Start a search
                  </Link>
                </BeamButton>
                <Link href="/hire/login" className="btn btn-secondary press">
                  Employer login <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>

            {/* Static brief → results mock (illustrative) */}
            <div
              className="rise"
              style={{ "--d": "280ms" } as React.CSSProperties}
              aria-hidden="true"
            >
              <div className="rounded-2xl bg-surface shadow-soft-md p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  Your brief
                </p>
                <p className="mt-2 text-[15px] leading-[1.55] text-ink font-medium">
                  Senior React engineer — someone who has shipped design systems,
                  not just used them.
                </p>
                <div className="mt-5 pt-4 border-t border-line grid gap-4">
                  {MOCK_ROWS.map((r) => (
                    <div key={r.name}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="grid place-items-center w-7 h-7 rounded-full bg-brand-soft text-brand-text text-[11px] font-semibold flex-none">
                            {r.initials}
                          </span>
                          <span className="text-[13.5px] text-body truncate">
                            {r.name}
                          </span>
                        </div>
                        <span className="text-[15px] font-semibold text-ink score-num flex-none">
                          {r.score}
                        </span>
                      </div>
                      <TraceFill width={`${r.score}%`} bg="#1F2DE6" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-14">
        <div className="max-w-[1160px] mx-auto px-6">
          <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold tracking-[-0.02em] leading-[1.12] text-ink">
            How a search runs.
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 mt-8">
            {STEPS.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl bg-surface shadow-soft-md p-6"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full flex-none"
                    style={{ background: "var(--brand)" }}
                    aria-hidden="true"
                  />
                  <h3 className="text-[15.5px] font-semibold text-ink tracking-[-0.01em]">
                    {s.title}
                  </h3>
                </div>
                <p className="mt-3 text-[14.5px] leading-[1.6] text-body">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Score anatomy */}
      <section className="py-14">
        <div className="max-w-[1160px] mx-auto px-6">
          <div className="rounded-2xl bg-surface shadow-soft-md p-7 sm:p-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold tracking-[-0.02em] leading-[1.12] text-ink">
                What a score is made of.
              </h2>
              <p className="mt-4 text-[15.5px] leading-[1.6] text-body max-w-[46ch]">
                Five parts, fixed weights, every part visible in the results.
                When someone ranks, you can see which dimension carried them —
                and which one didn&apos;t.
              </p>
            </div>
            <div className="grid gap-5">
              {WEIGHTS.map((w) => (
                <div key={w.label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14.5px] font-medium text-ink">
                      {w.label}
                    </span>
                    <span className="font-mono text-[13px] text-muted">
                      {w.pct}%
                    </span>
                  </div>
                  <TraceFill width={`${w.pct}%`} bg="#1F2DE6" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 pb-24">
        <div className="max-w-[1160px] mx-auto px-6">
          <div className="rounded-2xl bg-surface shadow-soft-md p-8 sm:p-12 text-center">
            <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold tracking-[-0.02em] text-ink">
              Describe your first hire.
            </h2>
            <p className="mt-4 text-[15.5px] leading-[1.6] text-muted max-w-[52ch] mx-auto">
              Search runs behind an employer session — one email on this device
              opens it. Then it&apos;s a brief away.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
              <BeamButton>
                <Link href="/hire/search" className="btn btn-primary press">
                  Start a search <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </BeamButton>
              <Link href="/hire/login" className="btn btn-secondary press">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
