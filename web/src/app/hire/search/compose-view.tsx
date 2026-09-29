"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  CircleAlert,
  Loader2,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { DOMAINS, EMPLOYMENT_TYPES, normalizeSkills } from "@/lib/skills";
import SkillPicker from "@/components/SkillPicker";
import {
  CURRENCIES,
  EXAMPLES,
  EXP_RANGES,
  MODE_OPTS,
  SUGGESTIONS,
  SENIORITY_OPTS,
  type Run,
} from "./search-ui";

export function SearchHero() {
  return (
    <section className="pt-16 lg:pt-24 pb-8">
      <div className="text-center">
        <h1
          className="rise text-[clamp(2rem,4.6vw,3.25rem)] font-semibold tracking-[-0.03em] leading-[1.06] text-ink"
          style={{ "--d": "60ms" } as React.CSSProperties}
        >
          Who do you need?
        </h1>
        <p
          className="rise mt-4 text-[17px] leading-[1.6] text-muted max-w-[560px] mx-auto"
          style={{ "--d": "160ms" } as React.CSSProperties}
        >
          Describe your target role in plain English. Requirements get parsed
          automatically and matched against verified candidates.
        </p>
      </div>
    </section>
  );
}

function SegGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <motion.button
            key={o.v}
            type="button"
            className={`seg-btn ${value === o.v ? "is-on" : ""}`}
            aria-pressed={value === o.v}
            whileTap={{ scale: 0.96 }}
            onClick={() => onChange(o.v)}
          >
            {o.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function ComposeView({
  prompt,
  setPrompt,
  deep,
  setDeep,
  refineOpen,
  setRefineOpen,
  seniority,
  setSeniority,
  mode,
  setMode,
  expLabel,
  setExpLabel,
  mustHave,
  setMustHave,
  domain,
  setDomain,
  employment,
  setEmployment,
  currency,
  setCurrency,
  amount,
  setAmount,
  relocation,
  setRelocation,
  errs,
  clearErr,
  resetFeedback,
  notice,
  busy,
  onSubmit,
  lastRun,
  onShowLast,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  deep: boolean;
  setDeep: (v: boolean) => void;
  refineOpen: boolean;
  setRefineOpen: (v: boolean) => void;
  seniority: string;
  setSeniority: (v: string) => void;
  mode: string;
  setMode: (v: string) => void;
  expLabel: string;
  setExpLabel: (v: string) => void;
  mustHave: string[];
  setMustHave: Dispatch<SetStateAction<string[]>>;
  domain: string;
  setDomain: (v: string) => void;
  employment: string;
  setEmployment: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  relocation: boolean;
  setRelocation: (v: boolean) => void;
  errs: Record<string, string>;
  clearErr: (key: string) => void;
  resetFeedback: () => void;
  notice: string | null;
  busy: boolean;
  onSubmit: () => void;
  lastRun: Run | null;
  onShowLast: () => void;
}) {
  const composerErr = errs.description || errs.title;

  const applyExample = (ex: (typeof EXAMPLES)[number]) => {
    setPrompt(ex.prompt);
    setMustHave((prev) =>
      prev.length ? prev : [...normalizeSkills([...ex.skills])],
    );
    resetFeedback();
  };

  const toggleSuggestion = (raw: string) => {
    const n = normalizeSkills([raw])[0] ?? raw;
    const key = n.toLowerCase();
    setMustHave((prev) =>
      prev.some((s) => s.toLowerCase() === key)
        ? prev.filter((s) => s.toLowerCase() !== key)
        : [...prev, n],
    );
    clearErr("must_have");
  };

  const senLabel =
    SENIORITY_OPTS.find((o) => o.v === seniority)?.label ?? seniority;
  const modeLabel = MODE_OPTS.find((o) => o.v === mode)?.label ?? mode;
  const summary = [
    senLabel,
    modeLabel,
    expLabel === "Any" ? "any experience" : expLabel,
    `${mustHave.length} must-have${mustHave.length === 1 ? "" : "s"}`,
    amount.trim() ? `${currency} ${amount.trim()}` : null,
    relocation ? "relocation ok" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="sq-try">
        <span className="sq-try-label">Try</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="chip-toggle"
            onClick={() => applyExample(ex)}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="composer">
        <textarea
          className="composer-input"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            clearErr("description");
            clearErr("title");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Describe the role you're hiring for…"
          aria-label="Describe the role you're hiring for"
          maxLength={10000}
          aria-invalid={composerErr ? true : undefined}
        />
        <div className="composer-bar">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <button
              type="button"
              className={`chip-toggle ${deep ? "is-on" : ""}`}
              aria-pressed={deep}
              onClick={() => setDeep(!deep)}
            >
              <Sparkles size={14} aria-hidden="true" /> Deep read
            </button>
            <span className="sq-hint">
              <span className="sq-kbd">⏎</span> search
              <span aria-hidden="true"> · </span>
              <span className="sq-kbd">⇧⏎</span> newline
            </span>
          </div>
          <button
            type="button"
            className="send-btn"
            onClick={onSubmit}
            disabled={busy}
            aria-label="Run search"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {composerErr ? (
        <span className="field-error block mt-2" role="alert">
          {composerErr}
        </span>
      ) : null}
      {notice ? (
        <div className="notice notice-warn mt-4" role="status">
          <CircleAlert aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="rounded-2xl bg-surface shadow-soft-md mt-5 overflow-hidden">
        <button
          type="button"
          className="btn-plain flex w-full items-center justify-between gap-3 sq-refine-head"
          onClick={() => setRefineOpen(!refineOpen)}
          aria-expanded={refineOpen}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="sq-refine-ic" aria-hidden="true">
              <Briefcase size={16} />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-[15px] font-semibold text-ink tracking-[-0.01em]">
                Refine constraints
              </span>
              <span className="sq-refine-sum">{summary}</span>
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted flex-none">
            {refineOpen ? "Collapse" : "Expand"}
            <ChevronRight
              size={15}
              className={`transition-transform ${refineOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </span>
        </button>

        {refineOpen ? (
          <div className="px-5 pb-6 pt-5 border-t border-line grid gap-6 sq-refine-body">
            <div className="grid gap-5 sm:grid-cols-2">
              <SegGroup
                label="Seniority"
                value={seniority}
                options={SENIORITY_OPTS}
                onChange={setSeniority}
              />
              <SegGroup
                label="Work mode"
                value={mode}
                options={MODE_OPTS}
                onChange={setMode}
              />
            </div>

            <div className="field">
              <span className="field-label">Experience range</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {EXP_RANGES.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    className={`chip-toggle ${expLabel === r.label ? "is-on" : ""}`}
                    aria-pressed={expLabel === r.label}
                    onClick={() => setExpLabel(r.label)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <SkillPicker
                id="refine-skills"
                label="Skills & tech stack"
                required
                hint="The bar to clear - these are the must-haves."
                placeholder="+ Add skill…"
                error={errs.must_have}
                value={mustHave}
                onChange={(v) => {
                  setMustHave(v);
                  clearErr("must_have");
                }}
              />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="sq-try-label">Suggestions</span>
                {SUGGESTIONS.map((s) => {
                  const n = normalizeSkills([s])[0] ?? s;
                  const on = mustHave.some(
                    (m) => m.toLowerCase() === n.toLowerCase(),
                  );
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`chip-toggle ${on ? "is-on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleSuggestion(s)}
                    >
                      {on ? null : <span aria-hidden="true">+</span>}
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <span className="field-label">Target compensation (annual)</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field mb-0">
                  <label className="field-label" htmlFor="refine-currency">
                    Currency
                  </label>
                  <select
                    id="refine-currency"
                    className="select"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field mb-0">
                  <label className="field-label" htmlFor="refine-amount">
                    Amount
                  </label>
                  <input
                    id="refine-amount"
                    className="input"
                    inputMode="numeric"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      clearErr("salary_min");
                    }}
                    aria-invalid={errs.salary_min ? true : undefined}
                  />
                  {errs.salary_min ? (
                    <span className="field-error" role="alert">
                      {errs.salary_min}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="field mb-0">
                <label className="field-label" htmlFor="refine-domain">
                  Domain
                </label>
                <select
                  id="refine-domain"
                  className="select"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {errs.domain ? (
                  <span className="field-error" role="alert">
                    {errs.domain}
                  </span>
                ) : null}
              </div>
              <div className="field mb-0">
                <label className="field-label" htmlFor="refine-employment">
                  Employment
                </label>
                <select
                  id="refine-employment"
                  className="select"
                  value={employment}
                  onChange={(e) => setEmployment(e.target.value)}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={relocation}
                onChange={(e) => setRelocation(e.target.checked)}
              />
              <span>Must be open to relocation</span>
            </label>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        {lastRun ? (
          <button type="button" className="btn-link" onClick={onShowLast}>
            View last results ({lastRun.results.length}){" "}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : (
          <p className="empty-note">
            Your shortlist lands here - ranked, scored, with every sub-score one
            click open.
          </p>
        )}
      </div>
    </>
  );
}
