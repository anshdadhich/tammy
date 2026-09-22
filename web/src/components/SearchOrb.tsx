"use client";

import { SiriOrb } from "@/components/ui/siri-orb";

/**
 * Chatbot-style orb for the employer search box.
 * Idle: slow drift. Searching: fast spin.
 */
export default function SearchOrb({ searching = false }: { searching?: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 64,
        height: 64,
        flex: "0 0 auto",
      }}
    >
      <SiriOrb
        size="64px"
        animationDuration={searching ? 6 : 20}
        colors={
          searching
            ? {
                bg: "oklch(95% 0.02 264.695)",
                c1: "oklch(70% 0.16 350)",
                c2: "oklch(72% 0.16 230)",
                c3: "oklch(70% 0.16 280)",
              }
            : undefined
        }
      />
    </div>
  );
}
