"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
};

export default function LiquidFollowSlider({ min, max, step = 1, value, onChange }: Props) {
  const id = useId().replace(/:/g, "");
  const filterId = `gooey-filter-${id}`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const borderRef = useRef<SVGPathElement>(null);
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
    const liquidPath = pathRef.current!;
    const liquidBorder = borderRef.current!;
    const fillEl = fillRef.current!;
    if (!wrapper || !track || !liquidPath || !liquidBorder || !fillEl) return;

    let trackBounds = { minX: 0, maxX: 0 };
    let trackLeft = 0;
    let isDragging = false;
    let targetX = 0;
    let currentX = 0;
    let posVel = 0;
    let prevX = 0;
    let dragVelocity = 0;
    let followFactor = 0.03;
    let vel = 0;
    let springVel = 0;
    let springPos = 0;
    let raf = 0;

    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const valueToX = (val: number) => {
      const t = (clamp(val, min, max) - min) / Math.max(1e-9, max - min);
      return trackBounds.minX + t * (trackBounds.maxX - trackBounds.minX);
    };
    const xToValue = (x: number) => {
      const t = (x - trackBounds.minX) / Math.max(1e-9, trackBounds.maxX - trackBounds.minX);
      const raw = min + t * (max - min);
      const stepped = Math.round(raw / step) * step;
      return clamp(stepped, min, max);
    };

    function updateBounds() {
      const wrapperRect = wrapper!.getBoundingClientRect();
      const trackRect = track!.getBoundingClientRect();
      const relativeLeft = trackRect.left - wrapperRect.left;
      trackLeft = relativeLeft;
      trackBounds = {
        minX: relativeLeft + R,
        maxX: relativeLeft + trackRect.width - R,
      };
      // sync to current prop value if not dragging
      if (!isDragging) {
        const nx = valueToX(value);
        // initialize on first call
        if (currentX === 0 && targetX === 0) {
          currentX = nx;
          targetX = nx;
          prevX = nx;
        } else {
          targetX = nx;
        }
      }
    }

    function buildGooeyPath(cx: number, cy: number, deformation: number) {
      const factor = Math.max(-1.5, Math.min(1.5, deformation / 12));
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
      if (isDragging) {
        followFactor += (0.18 - followFactor) * 0.06;
        currentX += (targetX - currentX) * followFactor;
        dragVelocity = currentX - prevX;
      } else {
        const posStiffness = 0.08;
        const posDamping = 0.82;
        const posForce = (targetX - currentX) * posStiffness;
        posVel = (posVel + posForce) * posDamping;
        currentX += posVel;
        // sync external value changes
        const desired = valueToX(valueRef.current);
        // gently pull target to desired when not dragging (for programmatic changes)
        targetX += (desired - targetX) * 0.2;
      }
      currentX = Math.max(trackBounds.minX, Math.min(trackBounds.maxX, currentX));
      vel = currentX - prevX;
      prevX = currentX;
      const shapeStiffness = 0.06;
      const shapeDamping = 0.82;
      const springForce = (vel - springPos) * shapeStiffness;
      springVel = (springVel + springForce) * shapeDamping;
      springPos += springVel;
      const pathData = buildGooeyPath(currentX, 50, springPos);
      liquidPath!.setAttribute("d", pathData);
      liquidBorder!.setAttribute("d", pathData);
      // update fill from track left to thumb
      const fillWidth = Math.max(0, currentX - trackLeft);
      fillEl!.style.width = `${fillWidth}px`;
      raf = requestAnimationFrame(loop);
    }

    function handlePointerMove(e: PointerEvent) {
      if (!isDragging) return;
      const rect = wrapper!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      targetX = Math.max(trackBounds.minX, Math.min(trackBounds.maxX, x));
      const newVal = xToValue(targetX);
      onChangeRef.current(newVal);
    }

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      followFactor = 0.03;
      (wrapper as any).setPointerCapture?.(e.pointerId);
      const rect = wrapper!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      targetX = Math.max(trackBounds.minX, Math.min(trackBounds.maxX, x));
      onChangeRef.current(xToValue(targetX));
    };
    const onPointerMove = (e: PointerEvent) => handlePointerMove(e);
    const onPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        posVel = dragVelocity * 1.35;
      }
    };

    wrapper!.addEventListener("pointerdown", onPointerDown as any);
    wrapper!.addEventListener("pointermove", onPointerMove as any);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", updateBounds);
    const ro = new ResizeObserver(updateBounds);
    ro.observe(wrapper!);
    ro.observe(track!);
    updateBounds();
    // init target to prop
    targetX = valueToX(valueRef.current);
    currentX = targetX;
    prevX = targetX;
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      wrapper!.removeEventListener("pointerdown", onPointerDown as any);
      wrapper!.removeEventListener("pointermove", onPointerMove as any);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", updateBounds);
      ro.disconnect();
    };
  }, [min, max, step]);

  return (
    <div
      ref={wrapperRef}
      className="slider-wrapper"
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
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div
        ref={trackRef}
        className="track"
        style={{
          position: "absolute",
          width: "calc(100% - 80px)",
          maxWidth: 320,
          height: 14,
          backgroundColor: "#dddddd",
          borderRadius: 7,
          overflow: "hidden",
        }}
      >
        <div
          ref={fillRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: 0,
            backgroundColor: "#1F2DE6",
            borderRadius: 7,
          }}
        />
      </div>
      <svg
        className="svg-canvas"
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
        <path ref={pathRef} className="liquid-thumb" d="" style={{ fill: "#ffffff" }} />
        <path
          ref={borderRef}
          className="liquid-border"
          d=""
          style={{ fill: "none", stroke: "rgba(0,0,0,0.22)", strokeWidth: 2.8, filter: "blur(0.4px)" }}
        />
      </svg>
    </div>
  );
}
