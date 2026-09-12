"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import Lookup from "./lookup";

function CountUp({ target, runKey }: { target: number; runKey: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, runKey]);
  return <span ref={ref}>{val}</span>;
}

function FitRing({ score }: { score: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const C = 2 * Math.PI * 26;
  return (
    <div className="l-ring" ref={ref}>
      <svg viewBox="0 0 60 60">
        <circle className="l-track" cx="30" cy="30" r="26" />
        <motion.circle
          className="l-fill"
          cx="30"
          cy="30"
          r="26"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={inView ? { strokeDashoffset: C * (1 - score / 100) } : {}}
          transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <span className="l-ringnum">
        <CountUp target={score} runKey={0} />
      </span>
    </div>
  );
}

const QUERY_SKILLS = ["Figma", "Design Systems", "Prototyping", "Remote OK"];

const PREVIEW_ROWS = [
  {
    dot: "AM",
    name: "Aarav Mehta",
    sub: "Senior Product Designer · Bengaluru · Available now",
    pills: ["Design Systems", "Figma", "Prototyping"],
    score: 87,
    bars: [["Skills", 92], ["Evidence", 85], ["Experience", 80]] as [string, number][],
  },
  {
    dot: "DK",
    name: "Diya Kapoor",
    sub: "Product Designer · Remote · On notice",
    pills: ["Figma", "Prototyping"],
    score: 81,
    bars: [["Skills", 84], ["Evidence", 78], ["Experience", 74]] as [string, number][],
  },
  {
    dot: "RS",
    name: "Rohan Shah",
    sub: "UI Engineer · Mumbai · Available now",
    pills: ["Figma", "Design Systems"],
    score: 78,
    bars: [["Skills", 80], ["Evidence", 75], ["Experience", 72]] as [string, number][],
  },
];

const STUDIO_SKILLS = ["Figma", "React", "Design Systems", "Prototyping", "User Research", "Motion"];

const ENGINE_STAGES = [
  { n: "01", tag: "PASS / FAIL", name: "Hard filters", desc: "Location, mode and must-haves gate the pool.", w: 100 },
  { n: "02", tag: "VECTOR", name: "Evidence match", desc: "Profile chunks ranked against the brief.", w: 92 },
  { n: "03", tag: "SCORING", name: "Live scoring", desc: "Skills, depth, salary and availability weighed.", w: 85 },
  { n: "04", tag: "JUDGE", name: "Deep read", desc: "Top profiles read fully for strengths and gaps.", w: 78 },
];

const FLOW = [
  ["01", "Describe", "Type the role like you'd say it."],
  ["02", "Filter", "Location, salary, mode, experience."],
  ["03", "Rank", "Matches ordered by cited evidence."],
  ["04", "Open", "Full portfolio, depth badges, files."],
  ["05", "Contact", "Message logged, candidate emailed."],
];

export default function Landing() {
  const [pool, setPool] = useState<number | null>(null);
  const [activeSkills, setActiveSkills] = useState<string[]>(QUERY_SKILLS.slice(0, 3));
  const [studioSkills, setStudioSkills] = useState<string[]>(STUDIO_SKILLS.slice(0, 4));
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (typeof j?.visibleCandidates === "number") setPool(j.visibleCandidates);
      })
      .catch(() => {});
  }, []);

  function toggleSkill(s: string) {
    setActiveSkills((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]));
  }

  function toggleStudio(s: string) {
    setStudioSkills((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]));
  }

  return (
    <div>
      <div className="l-navwrap">
        <nav className="l-nav">
          <Link className="brand" href="/">
            Tammy <small>· Beta</small>
          </Link>
          <span className="l-links">
            <a href="#preview">Preview</a>
            <a href="#studio">Studio</a>
            <a href="#engine">Engine</a>
            <a href="/hire">Employers</a>
          </span>
          <span className="l-navright">
            {pool !== null && pool > 0 ? (
              <span className="l-ticker">
                <span className="l-dot" />
                {pool} live {pool === 1 ? "profile" : "profiles"}
              </span>
            ) : null}
            <Link className="btn-frame btn-green" href="/start">
              <span className="h tl"></span>
              <span className="h tr"></span>
              <span className="h bl"></span>
              <span className="h br"></span>
              Build my page
            </Link>
          </span>
        </nav>
      </div>
      <div className="hatch-top" />

      <div className="l-page">
        <motion.header
          className="l-hero"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <span className="l-badge">Evidence over buzzwords</span>
          <h1>
            Meet the person
            <br />
            behind the profile.
          </h1>
          <p>
            Candidates file one deep portfolio page. Employers describe the
            role in plain words and meet ranked matches with proof — no
            keyword bingo, no endless applications.
          </p>
          <div className="l-actions">
            <Link className="btn-frame btn-green" href="/start">
              <span className="h tl"></span>
              <span className="h tr"></span>
              <span className="h bl"></span>
              <span className="h br"></span>
              Build my page →
            </Link>
            <Link className="btn-frame" href="/hire">
              <span className="h tl"></span>
              <span className="h tr"></span>
              <span className="h bl"></span>
              <span className="h br"></span>
              Search talent
            </Link>
          </div>
        </motion.header>

        <motion.div
          id="preview"
          className="l-preview"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.12 }}
        >
          <div className="l-dashbar">
            <span className="l-dots">
              <span />
              <span />
              <span />
            </span>
            <span className="l-dashstatus">Sourcing desk · live preview</span>
          </div>
          <div className="l-dashbody">
            <div className="l-dashside">
              <p className="section-label">Active query</p>
              <h3>Senior Product Designer</h3>
              <div className="chips" style={{ marginTop: 10 }}>
                {QUERY_SKILLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={"chipbtn" + (activeSkills.includes(s) ? " on" : "")}
                    onClick={() => toggleSkill(s)}
                    title="Toggle to highlight matches"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="l-metrics">
                <div>
                  <span>Candidate pool</span>
                  <b>{pool !== null ? `${pool} visible` : "Live"}</b>
                </div>
                <div>
                  <span>Ranking</span>
                  <b>Evidence-weighted</b>
                </div>
                <div>
                  <span>Contact</span>
                  <b>Open on match</b>
                </div>
              </div>
            </div>
            <div className="l-dashmain">
              <div className="l-reshead">
                <strong>Ranked shortlist</strong>
                <button className="btn-plain" type="button" onClick={() => setRunKey((k) => k + 1)}>
                  Replay scores ↻
                </button>
              </div>
              {PREVIEW_ROWS.map((r, i) => (
                <motion.div
                  key={r.name}
                  className="cand-row l-prevrow"
                  style={{ cursor: "default" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
                >
                  <span className="cand-dot">{r.dot}</span>
                  <span className="cand-main">
                    <h4>{r.name}</h4>
                    <p>{r.sub}</p>
                    <span className="cand-meta" style={{ whiteSpace: "normal" }}>
                      {r.pills.map((p) => (
                        <span
                          key={p}
                          className="minipill"
                          data-on={activeSkills.includes(p) || undefined}
                        >
                          {p}
                        </span>
                      ))}
                    </span>
                    <span className="l-subbars">
                      {r.bars.map(([label, w]) => (
                        <span className="l-subbar" key={label}>
                          <small>{label}</small>
                          <span className="l-track">
                            <motion.span
                              className="l-fill"
                              initial={{ width: 0 }}
                              whileInView={{ width: `${w}%` }}
                              viewport={{ once: true, margin: "-40px" }}
                              transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 + i * 0.1 }}
                            />
                          </span>
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="score">
                    ★ <CountUp target={r.score} runKey={runKey} />
                  </span>
                </motion.div>
              ))}
              <p className="l-cap">
                Preview with sample data — click skills to highlight matches. Your
                real search runs the same ranking on live profiles.
              </p>
            </div>
          </div>
        </motion.div>

        <section className="l-sec">
          <p className="section-label">01 · The problem</p>
          <h2>Hiring runs on the wrong inputs.</h2>
          <p className="l-lead">
            Candidates rewrite resumes to pass keyword filters. Recruiters read
            rehearsed bullets instead of verified project evidence.
          </p>
          <div className="l-duo">
            <div className="form-card">
              <p className="section-label">The broken loop</p>
              <h3>Apply. Reformat. Disappear.</h3>
              <p>Every application wants a new format. Strong builders get
              filtered by naive parsers before a human sees their craft.</p>
              <div className="l-strip">
                <div><span>Application #184 · Designer</span><span>Awaiting review</span></div>
                <div><span>Application #183 · Systems lead</span><span>Filtered out</span></div>
              </div>
            </div>
            <div className="form-card l-hi">
              <p className="section-label">The Tammy engine</p>
              <h3>Prove it once. Match repeatedly.</h3>
              <p>One structured page — skills, project proof, conditions — becomes
              the single source of truth every search reads.</p>
              <div className="l-strip">
                <div><span>Craft signals extracted</span><b>Evidence-ranked</b></div>
                <div><span>Direct contact</span><b>Open on match</b></div>
              </div>
            </div>
          </div>
        </section>

        <section id="studio" className="l-sec">
          <p className="section-label">02 · Profile studio</p>
          <h2>Fill it in once. Watch it render.</h2>
          <p className="l-lead">
            Answer structured prompts on <Link href="/start">/start</Link> — this is
            what comes out. Toggle skills to see the page react live:
          </p>
          <div className="l-studio">
            <div className="l-studioctl">
              <p className="section-label">Core strengths — click to toggle</p>
              <div className="chips">
                {STUDIO_SKILLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={"chipbtn" + (studioSkills.includes(s) ? " on" : "")}
                    onClick={() => toggleStudio(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Link className="btn-frame btn-green" href="/start" style={{ marginTop: 18 }}>
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                Make yours →
              </Link>
            </div>
            <div className="l-studioprev">
              <div className="l-idrow">
                <span className="cand-dot" style={{ width: 52, height: 52, fontSize: 17 }}>AM</span>
                <div>
                  <h3>Aarav Mehta</h3>
                  <p>Product designer, building in code. · 4 yrs · Bengaluru</p>
                </div>
              </div>
              <p className="l-bio">
                Product designer turning complex ideas into clear, thoughtful
                products — from first flow to shipped code.
              </p>
              <p className="section-label">Live profile chips</p>
              <div className="skillrow">
                {studioSkills.length ? (
                  studioSkills.map((s) => (
                    <span className="skilltag" key={s}>{s}</span>
                  ))
                ) : (
                  <span className="l-empty">Toggle a skill — your page updates instantly.</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="engine" className="l-sec">
          <p className="section-label">03 · Match engine</p>
          <h2>The score explains itself.</h2>
          <p className="l-lead">
            No black box. Filters gate the pool, then four inspectable signals
            rank every candidate — the same pipeline your searches run:
          </p>
          <div className="l-engine">
            <div className="l-stages">
              {ENGINE_STAGES.map((s, i) => (
                <div className="l-stage" key={s.n}>
                  <p className="section-label">{s.n} · {s.tag}</p>
                  <h4>{s.name}</h4>
                  <p>{s.desc}</p>
                  <span className="l-track big">
                    <motion.span
                      className="l-fill"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${s.w}%` }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1], delay: i * 0.12 }}
                    />
                  </span>
                </div>
              ))}
            </div>
            <div className="l-engfoot">
              <div className="edu-card">
                <h4>Aarav Mehta · ★ 87</h4>
                <p>Design-system ownership across 3 projects · 4 yrs vs 2-yr floor · remote-first.</p>
              </div>
              <div className="edu-card">
                <h4>Diya Kapoor · ★ 81</h4>
                <p>Strong Figma craft · gap to probe: no design-system scale evidence yet.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="l-sec">
          <p className="section-label">04 · Sourcing flow</p>
          <h2>Paste the role. Read the shortlist.</h2>
          <div className="l-flow">
            {FLOW.map(([n, h, p]) => (
              <div className="l-flowcol" key={n}>
                <span>{n}</span>
                <h4>{h}</h4>
                <p>{p}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <Link className="btn-frame btn-green" href="/hire">
              <span className="h tl"></span>
              <span className="h tr"></span>
              <span className="h bl"></span>
              <span className="h br"></span>
              Open the desk →
            </Link>
          </div>
        </section>

        <section className="l-sec">
          <p className="section-label">05 · The shortlist output</p>
          <h2>The first call starts with context.</h2>
          <p className="l-lead">
            Every match shows skill intersections, verified achievements and
            trade-offs — before you ever say hello:
          </p>
          <div className="l-dossier">
            <div className="l-dosside">
              <div className="l-gauge">
                <FitRing score={87} />
                <div>
                  <h3>Fit score</h3>
                  <p>Rank #1 of pool</p>
                </div>
              </div>
              <h3>Aarav Mehta</h3>
              <p>Senior Product Designer · Bengaluru · Available now · Remote-first · 4 yrs</p>
            </div>
            <div className="l-dosmain">
              <div className="edu-card">
                <h4>Matched signals · verified</h4>
                <p>Design-system ownership, Figma craft, prototype-to-production delivery across 3 projects.</p>
              </div>
              <div className="edu-card">
                <h4>Gap to probe · trade-off</h4>
                <p>No fintech domain evidence yet — worth one interview question, not a filter.</p>
              </div>
              <div className="edu-card">
                <h4>Why ranked #1 · 87 / 100</h4>
                <p>Top skill overlap, 4 years against a 2-year floor, immediate availability.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="l-sec">
          <p className="section-label">06 · Trust & control</p>
          <h2>Honest details need protection.</h2>
          <div className="l-trust">
            <div className="form-card">
              <h3>Private stays private</h3>
              <p>Salary, location prefs and availability feed matching — they never render on the public page.</p>
            </div>
            <div className="form-card">
              <h3>Visibility switch</h3>
              <p>Visible, hidden or inactive from your own dashboard. Changes apply to search instantly.</p>
            </div>
            <div className="form-card">
              <h3>Open-contact audit</h3>
              <p>Every HR message is logged and emailed to you. Nothing hidden, nothing gated.</p>
            </div>
          </div>
        </section>

        <section className="l-narrow">
          <p className="section-label">How it works</p>
          <ol className="steps">
            <li>
              <span className="n">01</span>
              <strong>File once</strong>
              <span>Skills, project proof, salary, availability — one dossier.</span>
            </li>
            <li>
              <span className="n">02</span>
              <strong>Get scored</strong>
              <span>Every search ranks you with cited evidence and honest gaps.</span>
            </li>
            <li>
              <span className="n">03</span>
              <strong>Get found</strong>
              <span>Teams open your contact on match. You never apply again.</span>
            </li>
          </ol>
        </section>

        <section className="l-narrow">
          <p className="section-label">Two ways in</p>
          <div className="path-grid">
            <Link className="path-card" href="/start">
              <span className="kicker">For candidates</span>
              <h2>One page that hires you.</h2>
              <p>Ten minutes, one structured form — experience, proof, contact.</p>
              <span className="btn-frame">
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                Build my page →
              </span>
            </Link>
            <Link className="path-card" href="/hire">
              <span className="kicker">For employers</span>
              <h2>Describe. Search. Meet.</h2>
              <p>Type the role like you&apos;d say it, tune filters, open portfolios.</p>
              <span className="btn-frame">
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                Search talent →
              </span>
            </Link>
          </div>
        </section>

        <section className="l-narrow">
          <div className="lookup">
            <h3>Already have a page?</h3>
            <p>Enter the email you signed up with to open it.</p>
            <Lookup />
          </div>
        </section>

        <motion.section
          className="l-sec"
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="liquid-emerald-stage l-final">
            <h2>Give talent a better first impression.</h2>
            <p>
              Build your page once and let verified matches come to you — or
              bring your open role and find the people already doing the work.
            </p>
            <div className="l-actions">
              <Link className="btn-frame inv" href="/start">
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                Create candidate page →
              </Link>
              <Link className="btn-frame inv" href="/hire">
                <span className="h tl"></span>
                <span className="h tr"></span>
                <span className="h bl"></span>
                <span className="h br"></span>
                Open sourcing desk
              </Link>
            </div>
          </div>
        </motion.section>
      </div>

      <footer className="afoot">
        <div className="afoot-grid">
          <div className="afoot-brand">
            <span className="brand">
              Tammy <small>· Beta</small>
            </span>
            <p>
              One deep portfolio per candidate. Evidence-ranked search for
              employers. No keyword bingo, no endless applications.
            </p>
          </div>
          <div className="afoot-col">
            <h5>Candidates</h5>
            <Link href="/start">Build my page</Link>
            <Link href="/">Find my page</Link>
            <Link href="/start">Edit section</Link>
          </div>
          <div className="afoot-col">
            <h5>Employers</h5>
            <Link href="/hire">Search talent</Link>
            <Link href="/hire/dash">Dashboard</Link>
            <Link href="/hire">Deep read</Link>
          </div>
          <div className="afoot-col">
            <h5>Product</h5>
            <a href="#preview">Live preview</a>
            <a href="#studio">Studio</a>
            <a href="#engine">Engine</a>
          </div>
          <div className="afoot-col">
            <h5>Elsewhere</h5>
            <div className="afoot-social">
              <a href="/hire" title="Hire">H</a>
              <a href="/start" title="Join">J</a>
              <a href="/" title="Top">↑</a>
            </div>
          </div>
        </div>
        <div className="afoot-meta">
          <span>© {new Date().getFullYear()} Tammy · Evidence over buzzwords.</span>
          <span>
            <Link href="/start">Terms</Link>
            <Link href="/hire">Privacy</Link>
          </span>
        </div>
        <div className="giant-watermark">TAMMY</div>
        <div className="hatch-bar" />
      </footer>
    </div>
  );
}
