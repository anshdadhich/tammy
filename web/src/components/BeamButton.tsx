"use client";

import type { ReactNode } from "react";
import { BorderBeam } from "border-beam";

type Props = {
  children: ReactNode;
  className?: string;
  strength?: number;
  active?: boolean;
  radius?: number;
};

/**
 * Major CTA with Beam glow — mono (grayscale, no purple) on light theme,
 * button-sized `sm`, strength 0.7 as requested.
 */
export default function BeamButton({ children, className, strength = 0.7, active = true, radius = 8 }: Props) {
  return (
    <BorderBeam
      size="sm"
      colorVariant="mono"
      strength={strength}
      theme="light"
      active={active}
      borderRadius={radius}
      className={className}
      style={{ display: "inline-block", borderRadius: radius }}
    >
      {children}
    </BorderBeam>
  );
}
