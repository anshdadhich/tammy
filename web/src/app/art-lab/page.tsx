"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion } from "motion/react";

type Layer = {
  id: number;
  img: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
};

const ART = ["/flow-lines.svg", "/flow-lines-2.svg", "/flow-lines-3.svg"];

let nextId = 3;

export default function ArtLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<Layer[]>([
    { id: 1, img: "/flow-lines.svg", x: 0, y: 0, w: 1080, h: 340, opacity: 0.6 },
    { id: 2, img: "/flow-lines-2.svg", x: 120, y: 60, w: 800, h: 250, opacity: 0.7 },
  ]);
  const [active, setActive] = useState(1);
  const [copied, setCopied] = useState(false);
  const resize = useRef<{ id: number; sx: number; sy: number; sw: number; sh: number } | null>(null);

  const cur = layers.find((l) => l.id === active) ?? layers[0];

  function patch(id: number, p: Partial<Layer>) {
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  }

  function onHandleDown(e: React.PointerEvent, layer: Layer) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = { id: layer.id, sx: e.clientX, sy: e.clientY, sw: layer.w, sh: layer.h };
    setActive(layer.id);
  }

  function onHandleMove(e: React.PointerEvent) {
    const r = resize.current;
    if (!r) return;
    patch(r.id, {
      w: Math.max(80, Math.round(r.sw + (e.clientX - r.sx))),
      h: Math.max(60, Math.round(r.sh + (e.clientY - r.sy))),
    });
  }

  function onHandleUp() {
    resize.current = null;
  }

  const placement = {
    canvas: { w: 1080, note: "hero stage, px from top-left" },
    layers: layers.map(({ id, img, x, y, w, h, opacity }) => ({
      id,
      img,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
      opacity,
    })),
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(placement, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 1180 }}>
      <div className="topbar">
        <Link className="brand" href="/hire">
          Tammy <small>· art lab</small>
        </Link>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          drag to place · corner to resize · or use X/Y sliders below · copy JSON to me
        </span>
      </div>

      <div
        ref={stageRef}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 1080,
          height: 420,
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(#eee 1px, transparent 1px), linear-gradient(90deg, #eee 1px, transparent 1px)",
            backgroundSize: "27px 27px",
            opacity: 0.6,
          }}
        />
        {layers.map((l) => (
          <motion.div
            key={l.id}
            drag
            dragConstraints={stageRef}
            dragMomentum={false}
            onDragStart={() => setActive(l.id)}
            onDragEnd={(_, info) => patch(l.id, { x: l.x + info.offset.x, y: l.y + info.offset.y })}
            onPointerDown={() => setActive(l.id)}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              x: l.x,
              y: l.y,
              width: l.w,
              height: l.h,
              backgroundImage: `url(${l.img})`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              opacity: l.opacity,
              border: active === l.id ? "1px dashed var(--accent)" : "1px dashed transparent",
              cursor: "move",
            }}
          >
            <div
              onPointerDown={(e) => onHandleDown(e, l)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              style={{
                position: "absolute",
                right: -9,
                bottom: -9,
                width: 18,
                height: 18,
                background: "#fff",
                border: "2px solid var(--accent)",
                borderRadius: 4,
                cursor: "nwse-resize",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              }}
              title="Drag to resize"
            />
          </motion.div>
        ))}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            textAlign: "center",
            pointerEvents: "none",
            opacity: 0.55,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800 }}>Headline sits here</div>
          <div style={{ fontSize: 12 }}>content reference — art goes behind</div>
        </div>
      </div>

      <div className="form-card" style={{ marginTop: 16, maxWidth: 1080 }}>
        <h3>Layers</h3>
        <div className="rowline" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {layers.map((l) => (
            <button
              key={l.id}
              type="button"
              className={"chipbtn" + (active === l.id ? " on" : "")}
              onClick={() => setActive(l.id)}
            >
              #{l.id} {l.img.split("/").pop()}
            </button>
          ))}
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              className="btn-plain"
              onClick={() => {
                const id = nextId++;
                setLayers((ls) => [...ls, { id, img: ART[i], x: 200, y: 100, w: 600, h: 200, opacity: 0.7 }]);
                setActive(id);
              }}
            >
              + {ART[i].split("/").pop()}
            </button>
          ))}
          {cur ? (
            <button
              type="button"
              className="btn-plain"
              onClick={() => setLayers((ls) => ls.filter((l) => l.id !== cur.id))}
            >
              Remove #{cur.id}
            </button>
          ) : null}
        </div>
        {cur ? (
          <div className="grid2">
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>
                Artwork — <span className="sliderval">{cur.img}</span>
              </label>
              <div className="seg">
                {ART.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={cur.img === a ? "on" : ""}
                    onClick={() => patch(cur.id, { img: a })}
                  >
                    {a.split("/").pop()}
                  </button>
                ))}
              </div>
            </div>
            <SliderMini label="Position X" value={cur.x} min={-200} max={1000} step={5} onChange={(v) => patch(cur.id, { x: Math.round(v) })} display={`${Math.round(cur.x)}px`} />
            <SliderMini label="Position Y" value={cur.y} min={-200} max={380} step={5} onChange={(v) => patch(cur.id, { y: Math.round(v) })} display={`${Math.round(cur.y)}px`} />
            <SliderMini label="Opacity" value={cur.opacity} min={0.1} max={1} step={0.05} onChange={(v) => patch(cur.id, { opacity: v })} display={cur.opacity.toFixed(2)} />
            <SliderMini label="Width" value={cur.w} min={80} max={1400} step={10} onChange={(v) => patch(cur.id, { w: Math.round(v) })} display={`${Math.round(cur.w)}px`} />
            <SliderMini label="Height" value={cur.h} min={60} max={800} step={10} onChange={(v) => patch(cur.id, { h: Math.round(v) })} display={`${Math.round(cur.h)}px`} />
          </div>
        ) : (
          <p className="pf-bio">Add a layer to begin.</p>
        )}
        <div className="field" style={{ marginTop: 12 }}>
          <label>Placement JSON — copy this to me</label>
          <textarea className="textarea" readOnly value={JSON.stringify(placement, null, 2)} style={{ minHeight: 180, fontSize: 12 }} onFocus={(e) => e.target.select()} />
        </div>
        <button type="button" className="btn-frame btn-green" onClick={copy}>
          <span className="h tl"></span><span className="h tr"></span><span className="h bl"></span><span className="h br"></span>
          {copied ? "Copied ✓" : "Copy placement JSON"}
        </button>
      </div>
    </div>
  );
}

function SliderMini({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label>
        {label} <span className="sliderval">{display}</span>
      </label>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
