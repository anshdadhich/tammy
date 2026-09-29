"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";

type Stage = { label: string; sub: string };

export default function SearchingView({
  title,
  brief,
  deep,
  stage,
  stages,
}: {
  title: string;
  brief: string;
  deep: boolean;
  stage: number;
  stages: Stage[];
}) {
  const pct = Math.round(((stage + 1) / stages.length) * 100);
  const waiting = stage >= stages.length - 1;

  return (
    <section
      className="rounded-2xl bg-surface shadow-soft-md p-7 sm:p-10"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <div className="sq-orb" aria-hidden="true">
          <span className="sq-orb-ring" />
          <span className="sq-orb-ring sq-orb-ring-2" />
          <span className="sq-orb-dot" />
        </div>

        <div className="flex items-center gap-2 mt-5">
          <span
            className="pulse-dot inline-block w-2 h-2 rounded-full bg-brand sq-status-dot"
            aria-hidden="true"
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-text">
            Searching the pool{deep ? " · deep read" : ""}
          </span>
        </div>

        <h2 className="mt-3 text-[clamp(1.35rem,2.6vw,1.75rem)] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <p className="mt-2 max-w-[520px] text-[14px] leading-[1.6] text-muted line-clamp-2">
          {brief}
        </p>
      </div>

      <ol className="sq-stage-list list-none">
        {stages.map((s, i) => {
          const state = i < stage ? "done" : i === stage ? "running" : "queued";
          return (
            <motion.li
              key={s.label}
              className={`sq-stage ${state === "done" ? "is-done" : ""} ${
                state === "running" ? "is-active" : ""
              }`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: i * 0.06, ease: "easeOut" }}
            >
              <span className="sq-stage-ic" aria-hidden="true">
                {state === "done" ? (
                  <Check size={12} />
                ) : state === "running" ? (
                  <span className="pulse-dot inline-block w-2 h-2 rounded-full bg-brand" />
                ) : null}
              </span>
              <span className="sq-stage-body">
                <span className="sq-stage-label">{s.label}</span>
                <span className="sq-stage-sub">{s.sub}</span>
              </span>
              <span
                className={`sq-stage-state ${state === "running" ? "is-running" : ""}`}
              >
                {state === "done"
                  ? "done"
                  : state === "running"
                    ? "running"
                    : "queued"}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="sq-bar" aria-hidden="true">
        <div className="sq-bar-fill" style={{ width: `${pct}%` }} />
        {waiting ? (
          <div className="sq-bar-sweep">
            <i />
          </div>
        ) : null}
      </div>
      <p className="sq-wait-note">
        {waiting
          ? "Ranking the final matches…"
          : `${pct}% - matching evidence across profiles`}
      </p>
    </section>
  );
}
