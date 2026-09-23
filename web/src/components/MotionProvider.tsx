"use client";

import { MotionConfig } from "motion/react";

/**
 * Global motion settings: `reducedMotion="user"` disables transform and
 * layout animations (opacity/color fades remain) whenever the OS or
 * browser reports a preference for reduced motion.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
