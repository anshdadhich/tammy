"use client";

import { useState } from "react";
import { Liquid } from "liquid-gooey";

/**
 * Exact Libraries.dev Gooey prompt demo — as requested.
 * Install: npm install liquid-gooey
 * Usage:
 * import { Liquid } from 'liquid-gooey'
 * <Liquid fill="#202020">
 *   <Liquid.Item x={open ? -54 : 0} y={open ? -34 : 0} transition={{ duration: 550, ease: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
 *   ...
 */
export default function GooeyPlusDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative h-[88px] w-[88px]">
      <Liquid fill="#202020">
        <Liquid.Item x={open ? -54 : 0} y={open ? -34 : 0} transition={{ duration: 550, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-[#1F2DE6] text-white text-sm shadow-md"
            aria-label="Action 1"
          >
            ✦
          </button>
        </Liquid.Item>
        <Liquid.Item
          x={0}
          y={open ? -64 : 0}
          transition={{ duration: 550, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
          delay={40}
        >
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-[#0B0D12] text-white text-sm shadow-md"
            aria-label="Action 2"
          >
            ◆
          </button>
        </Liquid.Item>
        <Liquid.Item>
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#202020] text-white text-lg font-bold shadow-lg"
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            +
          </button>
        </Liquid.Item>
      </Liquid>
    </div>
  );
}
