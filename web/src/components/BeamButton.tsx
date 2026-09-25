"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BorderBeam } from "border-beam";

type Props = {
  children: ReactNode;
  className?: string;
  strength?: number;
  active?: boolean;
  radius?: number;
};

export default function BeamButton({ children, className, strength = 0.7, active = true, radius = 999 }: Props) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setDark(document.documentElement.getAttribute("data-theme") === "dark");
      } catch {
      }
    };
    read();
    const mo = new MutationObserver(read);
    try {
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    } catch {
    }
    return () => mo.disconnect();
  }, []);

  return (
    <BorderBeam
      size="sm"
      colorVariant="mono"
      strength={strength}
      theme={dark ? "dark" : "light"}
      active={active}
      borderRadius={radius}
      className={className}
      style={{ display: "inline-block", borderRadius: radius }}
    >
      {children}
    </BorderBeam>
  );
}
