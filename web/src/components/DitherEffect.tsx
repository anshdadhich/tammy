"use client";

import { useEffect, useRef, useState } from "react";

/**
 * WebGL Dither Effect — ported from the Originkit / reference HTML shader.
 * Uses 3D Ashima Arts simplex noise + recursive 32-step Bayer ordered dithering.
 * Renders a chunky retro-matrix dithered gradient between two colors.
 */

interface DitherEffectProps {
  colorFront?: string;
  colorBack?: string;
  scale?: number;
  speed?: number;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}

/* ─── Shaders (WebGL1 / GLSL 100 — matches the reference exactly) ─── */

const VERT = `attribute vec3 aPosition;
void main() {
  vec4 pos = vec4(aPosition, 1.0);
  pos.xy = pos.xy * 2.0 - 1.0;
  gl_Position = pos;
}`;

const FRAG = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float uScale;
uniform vec3 u_colorFront;
uniform vec3 u_colorBack;

/* ─── Ashima Arts 3D Simplex Noise ─── */
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0,1.0/3.0);
  const vec4 D = vec4(0.0,0.5,1.0,2.0);
  vec3 i = floor(v + dot(v,C.yyy));
  vec3 x0 = v - i + dot(i,C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i,289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0,i1.z,i2.z,1.0))
    + i.y + vec4(0.0,i1.y,i2.y,1.0))
    + i.x + vec4(0.0,i1.x,i2.x,1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

/* ─── Recursive Bayer Ordered Dithering ─── */
float Bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
#define Bayer4(a)  (Bayer2(0.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a)  (Bayer4(0.5*(a))*0.25 + Bayer2(a))
#define Bayer16(a) (Bayer8(0.5*(a))*0.25 + Bayer2(a))
#define Bayer32(a) (Bayer16(0.5*(a))*0.25 + Bayer2(a))

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.x *= u_resolution.x / u_resolution.y;

  float t = u_time * 0.35;

  /* Two-octave animated 3D simplex noise */
  float n1 = snoise(vec3(uv * 1.5, t));
  float n2 = snoise(vec3(uv * 1.5 + 4.0, t * 1.1));
  float gray = mix(n1, n2, 0.5) * 0.5 + 0.5;

  /* 32-step Bayer ordered dither */
  float d = step(Bayer32(gl_FragCoord.xy * uScale), gray);

  vec3 finalColor = mix(u_colorFront, u_colorBack, d);
  gl_FragColor = vec4(finalColor, 1.0);
}`;

/* ─── Helpers ─── */

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("DitherEffect shader error:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.detachShader(prog, vs);
  gl.detachShader(prog, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("DitherEffect link error:", gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/* ─── Component ─── */

export default function DitherEffect({
  colorFront = "#059669",
  colorBack = "#ffffff",
  scale = 0.8,
  speed = 1,
  opacity = 1,
  className,
  style,
}: DitherEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  // Theme-aware: swap to a neutral dark pair when data-theme="dark" so the
  // animated dither never glares on dark surfaces (brand colors stay for light).
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        setDark(document.documentElement.getAttribute("data-theme") === "dark");
      } catch {
        /* ignore */
      }
    };
    read();
    const mo = new MutationObserver(read);
    try {
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    } catch {
      /* ignore */
    }
    return () => mo.disconnect();
  }, []);

  const front = dark ? "#3A3A42" : colorFront;
  const back = dark ? "#17171C" : colorBack;

  // Colors ride in a ref so theme flips only update uniforms — the GL
  // program, buffers and rAF loop are created once and never torn down
  // (teardown flashes a black frame, which reads as a broken transition).
  const colorRef = useRef({ front: hexToRgb(front), back: hexToRgb(back) });
  colorRef.current = { front: hexToRgb(front), back: hexToRgb(back) };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: false });
    if (!gl) return;

    const prog = createProgram(gl, VERT, FRAG);
    if (!prog) return;

    /* Full-screen quad: 3-float positions, 12-byte stride */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0, 0, 0,  1, 0, 0,  0, 1, 0,
        0, 1, 0,  1, 0, 0,  1, 1, 0,
      ]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, "aPosition");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);

    /* Uniform locations */
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uScale = gl.getUniformLocation(prog, "uScale");
    const uFront = gl.getUniformLocation(prog, "u_colorFront");
    const uBack = gl.getUniformLocation(prog, "u_colorBack");

    const startTime = performance.now();

    /* Resize — downscale for chunky retro matrix feel */
    const resize = () => {
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.floor(rect.width * 0.5));
      canvas!.height = Math.max(1, Math.floor(rect.height * 0.5));
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let paused = false;
    let disposed = false;
    const onVis = () => {
      paused = document.hidden;
      if (!paused && !disposed) requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", onVis);

    function render(now: number) {
      if (paused || disposed) return;
      const t = ((now - startTime) / 1000) * speed;

      gl!.useProgram(prog);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, t);
      gl!.uniform1f(uScale, scale);
      gl!.uniform3fv(uFront, colorRef.current.front);
      gl!.uniform3fv(uBack, colorRef.current.back);

      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      // Halt the loop FIRST. The visibilitychange handler schedules new
      // frames independently of rafRef, so cancelling the id alone left a
      // zombie loop drawing a deleted program+buffer every frame — the
      // "no buffer is bound / attempt to use a deleted object" spam.
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      if (prog) gl!.deleteProgram(prog);
      if (buf) gl!.deleteBuffer(buf);
    };
  }, [scale, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        pointerEvents: "none",
        opacity,
        ...style,
      }}
    />
  );
}
