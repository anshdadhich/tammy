"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type OnboardStep = {
  title: string;
  hint?: string;
};

/**
 * Animated stepper — standard onboarding rail.
 * Active step glides via shared layout pill, progress track springs,
 * completed steps collapse to a brand check. Content animation
 * stays with the parent (AnimatePresence around step panels).
 */
export default function OnboardingStepper({
  steps,
  current,
  onStep,
  meta,
}: {
  steps: OnboardStep[];
  current: number;
  onStep: (i: number) => void;
  meta?: ReactNode;
}) {
  return (
    <div className="onboard-steps">
      <div className="onboard-steps-head">
        <span className="onboard-count">
          Step {current + 1} of {steps.length}
        </span>
        {meta}
      </div>
      <ol className="onboard-rail">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.title} className="onboard-cell">
              <button
                type="button"
                onClick={() => onStep(i)}
                className={
                  "onboard-dot" + (done ? " done" : "") + (active ? " active" : "")
                }
                aria-current={active ? "step" : undefined}
                title={s.hint ?? s.title}
              >
                {active ? (
                  <motion.span
                    layoutId="onboard-active-pill"
                    className="onboard-pill"
                    transition={{ type: "spring", stiffness: 550, damping: 40 }}
                  />
                ) : null}
                <span className="onboard-num" aria-hidden="true">
                  {done ? <Check className="onboard-check" /> : i + 1}
                </span>
                <span className="onboard-label">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div
        className="onboard-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={current + 1}
      >
        <motion.div
          className="onboard-fill"
          initial={false}
          animate={{ width: `${((current + 1) / steps.length) * 100}%` }}
          transition={{ type: "spring", stiffness: 170, damping: 26 }}
        />
      </div>
    </div>
  );
}
