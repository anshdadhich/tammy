"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
};

export default function DualLiquidFollowSlider({ min, max, step = 1, value, onChange }: Props) {
  const id = useId().replace(/:/g, "");
  const filterId = `gooey-filter-dual-${id}`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pathARef = useRef<SVGPathElement>(null);
  const borderARef = useRef<SVGPathElement>(null);
  const pathBRef = useRef<SVGPathElement>(null);
  const borderBRef = useRef<SVGPathElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { valueRef.current = value; }, [value]);
  const R = 20;
  const K = R * 0.55228475;

  useEffect(() => {
    const wrapper = wrapperRef.current!;
    const track = trackRef.current!;
    const pathA = pathARef.current!;
    const borderA = borderARef.current!;
    const pathB = pathBRef.current!;
    const borderB = borderBRef.current!;
    const fillEl = fillRef.current!;
    if (!wrapper || !track || !pathA || !borderA || !pathB || !borderB || !fillEl) return;

    let bounds = { minX: 0, maxX: 0 };
    let trackLeft = 0;
    let raf = 0;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const valueToX = (val: number, b: typeof bounds) => {
      const t = (clamp(val, min, max) - min) / Math.max(1e-9, max - min);
      return b.minX + t * (b.maxX - b.minX);
    };
    const xToValue = (x: number, b: typeof bounds) => {
      const t = (x - b.minX) / Math.max(1e-9, b.maxX - b.minX);
      const raw = min + t * (max - min);
      const stepped = Math.round(raw / step) * step;
      return clamp(stepped, min, max);
    };

    // Two thumbs state
    let bnds = bounds;
    let dragging: "a" | "b" | null = null;
    let targetA = valueToX(valueRef.current[0], { minX: 0, maxX: 100 });
    let currentA = targetA;
    let posVelA = 0;
    let prevA = targetA;
    let dragVelA = 0;
    let followA = 0.03;
    let velA = 0;
    let springVelA = 0;
    let springPosA = 0;

    let targetB = valueToX(valueRef.current[1], { minX: 0, maxX: 100 });
    let currentB = targetB;
    let posVelB = 0;
    let prevB = targetB;
    let dragVelB = 0;
    let followB = 0.03;
    let velB = 0;
    let springVelB = 0;
    let springPosB = 0;

    function updateBounds() {
      const wr = wrapper!.getBoundingClientRect();
      const tr = track!.getBoundingClientRect();
      const left = tr.left - wr.left;
      trackLeft = left;
      bounds = { minX: left + R, maxX: left + tr.width - R };
      bnds = bounds;
      if (targetA === 0 && currentA === 0) {
        targetA = valueToX(valueRef.current[0], bounds);
        currentA = targetA;
        prevA = targetA;
        targetB = valueToX(valueRef.current[1], bounds);
        currentB = targetB;
        prevB = targetB;
      } else {
        // keep targets in sync with external value when not dragging
        if (dragging !== "a") targetA = valueToX(valueRef.current[0], bounds);
        if (dragging !== "b") targetB = valueToX(valueRef.current[1], bounds);
      }
      // ensure order
      if (targetA > targetB) {
        if (dragging === "a") targetA = targetB;
        else if (dragging === "b") targetB = targetA;
      }
    }

    function buildPath(cx: number, cy: number, def: number) {
      const factor = Math.max(-1.5, Math.min(1.5, def / 12));
      const absF = Math.abs(factor);
      const stretchTail = R * (1 + 1.25 * absF);
      const squeezeHead = R * (1 - 0.04 * absF);
      const squishY = R * (1 - 0.22 * absF);
      let top: any, right: any, bottom: any, left: any;
      let cTopR: any, cRightT: any, cRightB: any, cBottomR: any;
      let cBottomL: any, cLeftB: any, cLeftT: any, cTopL: any;
      if (factor >= 0) {
        top = { x: cx, y: cy - squishY };
        right = { x: cx + squeezeHead, y: cy };
        bottom = { x: cx, y: cy + squishY };
        left = { x: cx - stretchTail, y: cy };
        const kTail = K * (1 - 0.65 * absF);
        const kHead = K * (1 + 0.05 * absF);
        cTopR = { x: top.x + kHead, y: top.y };
        cRightT = { x: right.x, y: right.y - kHead };
        cRightB = { x: right.x, y: right.y + kHead };
        cBottomR = { x: bottom.x + kHead, y: bottom.y };
        cBottomL = { x: bottom.x - kHead, y: bottom.y };
        cLeftB = { x: left.x, y: left.y + kTail };
        cLeftT = { x: left.x, y: left.y - kTail };
        cTopL = { x: top.x - kHead, y: top.y };
      } else {
        top = { x: cx, y: cy - squishY };
        right = { x: cx + stretchTail, y: cy };
        bottom = { x: cx, y: cy + squishY };
        left = { x: cx - squeezeHead, y: cy };
        const kTail = K * (1 - 0.65 * absF);
        const kHead = K * (1 + 0.05 * absF);
        cTopR = { x: top.x + kTail, y: top.y };
        cRightT = { x: right.x, y: right.y - kTail };
        cRightB = { x: right.x, y: right.y + kTail };
        cBottomR = { x: bottom.x + kHead, y: bottom.y };
        cBottomL = { x: bottom.x - kHead, y: bottom.y };
        cLeftB = { x: left.x, y: left.y + kHead };
        cLeftT = { x: left.x, y: left.y - kHead };
        cTopL = { x: top.x - kHead, y: top.y };
      }
      return `M ${top.x} ${top.y} C ${cTopR.x} ${cTopR.y}, ${cRightT.x} ${cRightT.y}, ${right.x} ${right.y} C ${cRightB.x} ${cRightB.y}, ${cBottomR.x} ${cBottomR.y}, ${bottom.x} ${bottom.y} C ${cBottomL.x} ${cBottomL.y}, ${cLeftB.x} ${cLeftB.y}, ${left.x} ${left.y} C ${cLeftT.x} ${cLeftT.y}, ${cTopL.x} ${cTopL.y}, ${top.x} ${top.y} Z`;
    }

    function loop() {
      // A
      if (dragging === "a") {
        followA += (0.18 - followA) * 0.06;
        currentA += (targetA - currentA) * followA;
        dragVelA = currentA - prevA;
      } else {
        const f = (targetA - currentA) * 0.08;
        posVelA = (posVelA + f) * 0.82;
        currentA += posVelA;
        const desired = valueToX(valueRef.current[0], bnds);
        targetA += (desired - targetA) * 0.2;
        if (targetA > targetB) targetA = targetB;
      }
      currentA = Math.max(bnds.minX, Math.min(bnds.maxX, currentA));
      if (dragging !== "b" && currentA > currentB) currentA = currentB;
      velA = currentA - prevA;
      prevA = currentA;
      const sfA = (velA - springPosA) * 0.06;
      springVelA = (springVelA + sfA) * 0.82;
      springPosA += springVelA;
      const dA = buildPath(currentA, 50, springPosA);
      pathA!.setAttribute("d", dA);
      borderA!.setAttribute("d", dA);

      // B
      if (dragging === "b") {
        followB += (0.18 - followB) * 0.06;
        currentB += (targetB - currentB) * followB;
        dragVelB = currentB - prevB;
      } else {
        const f = (targetB - currentB) * 0.08;
        posVelB = (posVelB + f) * 0.82;
        currentB += posVelB;
        const desired = valueToX(valueRef.current[1], bnds);
        targetB += (desired - targetB) * 0.2;
        if (targetB < targetA) targetB = targetA;
      }
      currentB = Math.max(bnds.minX, Math.min(bnds.maxX, currentB));
      if (dragging !== "a" && currentB < currentA) currentB = currentA;
      velB = currentB - prevB;
      prevB = currentB;
      const sfB = (velB - springPosB) * 0.06;
      springVelB = (springVelB + sfB) * 0.82;
      springPosB += springVelB;
      const dB = buildPath(currentB, 50, springPosB);
      pathB!.setAttribute("d", dB);
      borderB!.setAttribute("d", dB);

      // fill between (track-relative)
      const left = Math.min(currentA, currentB) - trackLeft;
      const right = Math.max(currentA, currentB) - trackLeft;
      fillEl!.style.left = `${left}px`;
      fillEl!.style.width = `${Math.max(0, right - left)}px`;

      raf = requestAnimationFrame(loop);
    }

    function closestThumb(x: number): "a" | "b" {
      const da = Math.abs(x - currentA);
      const db = Math.abs(x - currentB);
      return da <= db ? "a" : "b";
    }

    const onDown = (e: PointerEvent) => {
      const rect = wrapper!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const c = closestThumb(x);
      dragging = c;
      if (c === "a") {
        followA = 0.03;
        targetA = Math.max(bnds.minX, Math.min(bnds.maxX, x));
        if (targetA > targetB) targetA = targetB;
        onChangeRef.current([xToValue(targetA, bnds), value[1]]);
      } else {
        followB = 0.03;
        targetB = Math.max(bnds.minX, Math.min(bnds.maxX, x));
        if (targetB < targetA) targetB = targetA;
        onChangeRef.current([value[0], xToValue(targetB, bnds)]);
      }
      (wrapper as any).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rect = wrapper!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (dragging === "a") {
        targetA = Math.max(bnds.minX, Math.min(bnds.maxX, x));
        if (targetA > targetB) targetA = targetB;
        onChangeRef.current([xToValue(targetA, bnds), value[1]]);
      } else {
        targetB = Math.max(bnds.minX, Math.min(bnds.maxX, x));
        if (targetB < targetA) targetB = targetA;
        onChangeRef.current([value[0], xToValue(targetB, bnds)]);
      }
    };
    const onUp = () => {
      if (dragging === "a") posVelA = dragVelA * 1.35;
      if (dragging === "b") posVelB = dragVelB * 1.35;
      dragging = null;
    };

    wrapper!.addEventListener("pointerdown", onDown as any);
    wrapper!.addEventListener("pointermove", onMove as any);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", updateBounds);
    const ro = new ResizeObserver(updateBounds);
    ro.observe(wrapper!);
    ro.observe(track!);
    updateBounds();
    targetA = valueToX(valueRef.current[0], bnds);
    currentA = targetA;
    prevA = targetA;
    targetB = valueToX(valueRef.current[1], bnds);
    currentB = targetB;
    prevB = targetB;
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      wrapper!.removeEventListener("pointerdown", onDown as any);
      wrapper!.removeEventListener("pointermove", onMove as any);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", updateBounds);
      ro.disconnect();
    };
  }, [min, max, step]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 400,
        height: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div
        ref={trackRef}
        style={{
          position: "absolute",
          width: "calc(100% - 80px)",
          maxWidth: 320,
          height: 14,
          backgroundColor: "#dddddd",
          borderRadius: 7,
        }}
      >
        <div
          ref={fillRef}
          style={{
            position: "absolute",
            top: 0,
            height: "100%",
            backgroundColor: "#1F2DE6",
            borderRadius: 7,
            left: 0,
            width: 0,
          }}
        />
      </div>
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "visible",
          filter: `url(#${filterId}) drop-shadow(0px 4px 8px rgba(0,0,0,0.10))`,
        }}
      >
        <path ref={pathARef} d="" style={{ fill: "#ffffff" }} />
        <path ref={borderARef} d="" style={{ fill: "none", stroke: "rgba(0,0,0,0.22)", strokeWidth: 2.8 } as any} />
        <path ref={pathBRef} d="" style={{ fill: "#ffffff" }} />
        <path ref={borderBRef} d="" style={{ fill: "none", stroke: "rgba(0,0,0,0.22)", strokeWidth: 2.8 } as any} />
      </svg>
    </div>
  );
}
