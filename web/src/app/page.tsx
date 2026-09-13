"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/* ═══════════════════════════════════════════════════════════════
   COUNT-UP HOOK
   ═══════════════════════════════════════════════════════════════ */
function useCountUp(target: number, duration = 900, active = true) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) { setVal(0); return }
    let raf: number
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * ease))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, active])
  return val
}

/* ═══════════════════════════════════════════════════════════════
   STUDIO CHIPS DATA
   ═══════════════════════════════════════════════════════════════ */
const STUDIO_CHIPS = [
  { label: "Design Systems", active: true },
  { label: "0→1 Products", active: true },
  { label: "User Research", active: true },
  { label: "Figma", active: true },
  { label: "Prototyping", active: false },
  { label: "B2B SaaS", active: false },
]

/* ═══════════════════════════════════════════════════════════════
   PIPELINE STAGES
   ═══════════════════════════════════════════════════════════════ */
const PIPELINE = [
  { stage: "01", weight: "PASS/FAIL", name: "Hard Filters", desc: "Location & work permit check.", width: 100, color: "var(--emerald)" },
  { stage: "02", weight: "WT 50%", name: "Skills Overlap", desc: "Required craft signal overlap.", width: 92, color: "var(--blue)" },
  { stage: "03", weight: "WT 25%", name: "Domain Context", desc: "Startup velocity & complexity.", width: 85, color: "var(--amber)" },
  { stage: "04", weight: "WT 25%", name: "Logistics Fit", desc: "Availability & timezone.", width: 95, color: "#71717a" },
]

/* ═══════════════════════════════════════════════════════════════
   CANDIDATES
   ═══════════════════════════════════════════════════════════════ */
const CANDIDATES = [
  { name: "Maya Chen", role: "Senior Product Designer · Berlin · Available Now", img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80", tags: ["Design Systems", "0→1 Products", "Figma"], score: 94 },
  { name: "Noah Williams", role: "Product Designer & Systems Architect · London", img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80", tags: ["Figma Systems", "Fintech"], score: 89 },
  { name: "Sarah Kim", role: "Product Strategist & UI Lead · Toronto", img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80", tags: ["SaaS UX", "Prototyping"], score: 86 },
]

/* ═══════════════════════════════════════════════════════════════
   FAQ DATA
   ═══════════════════════════════════════════════════════════════ */
const FAQ = [
  { q: "How does Tammy rank candidates?", a: "Tammy uses a four-stage match engine: hard filters (location, work permit), skills overlap (weighted 50%), domain context (25%), and logistics fit (25%). Every score shows what counted and what was missing — no black boxes." },
  { q: "Is my profile visible publicly?", a: "No. There is no public searchable directory. Profiles are discoverable solely through targeted recruiter searches. You control visibility and can unpublish or delete your profile at any time." },
  { q: "What happens after I build my profile?", a: "Your structured profile becomes your single source of truth. When a recruiter describes a role they need, Tammy surfaces your profile as a ranked match — with evidence for why you scored where you did." },
  { q: "Can I edit my profile after publishing?", a: "Yes. Changes propagate across recruiter indexes immediately. Update your skills, availability, or project evidence anytime — the match engine re-ranks in real time." },
]

/* ═══════════════════════════════════════════════════════════════
   SVG ICONS
   ═══════════════════════════════════════════════════════════════ */
const ChevronDown = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  /* --- Live Demo Toggle --- */
  const [demoActive, setDemoActive] = useState(true)
  const [poolCount, setPoolCount] = useState(16)
  const [studioChips, setStudioChips] = useState(STUDIO_CHIPS.map(c => c.active))

  /* --- Count-ups (tied to demo toggle) --- */
  const hero1 = useCountUp(94, 900, demoActive)
  const hero2 = useCountUp(89, 900, demoActive)
  const hero3 = useCountUp(86, 900, demoActive)
  const dossierScore = useCountUp(94, 1000, demoActive)

  /* --- SVG Ring --- */
  const RING_CIRCUMFERENCE = 163.4
  const ringOffset = demoActive ? RING_CIRCUMFERENCE * (1 - 94 / 100) : RING_CIRCUMFERENCE

  /* --- Pool ticker --- */
  useEffect(() => {
    const iv = setInterval(() => {
      setPoolCount(14 + Math.floor(Math.random() * 5))
    }, 4000)
    return () => clearInterval(iv)
  }, [])

  /* --- Studio chip toggle --- */
  const toggleChip = useCallback((i: number) => {
    setStudioChips(prev => prev.map((v, idx) => idx === i ? !v : v))
  }, [])

  return (
    <>
      {/* ─── TOP NAV ─── */}
      <div className="nav-wrap">
        <div className="page">
          <nav className="nav">
            <a href="#" className="brand">
              <div className="brand-mark">TW</div>
              Tammy
            </a>

            <div className="nav-links">
              <a href="#problem">The Problem</a>
              <a href="#studio">Profile Studio</a>
              <a href="#matching">Match Engine</a>
              <a href="#desk">Sourcing Desk</a>
            </div>

            <div className="nav-right">
              <div className="pool-ticker">
                <span className="ticker-dot" />
                <span>{poolCount} live profiles</span>
              </div>
              <a href="#studio" className="btn btn-dark">Build a profile</a>
            </div>
          </nav>
        </div>
      </div>

      <main className="page">

        {/* ─── HERO ─── */}
        <section className="hero">
          <div className="hero-badge">A verified signal layer for hiring</div>

          <h1>
            Meet the person<br />
            <span>behind the resume.</span>
          </h1>

          <p className="hero-sub">
            Give candidates a living profile showing how they actually work. Describe the role you need, and surface a shortlist ranked by real evidence — not keyword fluff.
          </p>

          <div className="hero-actions">
            <a href="#studio" className="btn btn-emerald btn-lg">Build your profile ↗</a>
            <a href="#matching" className="btn btn-outline btn-lg">Find candidates</a>

            <div
              className="live-demo-control"
              onClick={() => setDemoActive(v => !v)}
              title="Click to see live matching in action"
            >
              <span>Live match preview</span>
              <div className={`switch-track ${demoActive ? "active" : ""}`}>
                <div className="switch-thumb" />
              </div>
            </div>
          </div>

          {/* ─── HERO DASHBOARD PREVIEW ─── */}
          <div className="dashboard-preview">
            <div className="dash-topbar">
              <div className="window-pills">
                <div className="w-dot" /><div className="w-dot" /><div className="w-dot" />
              </div>
              <div className="dash-status">Sourcing Desk · Live extraction active</div>
            </div>

            <div className="dash-body">
              <div className="dash-sidebar">
                <div className="role-header-badge">Active Job Query</div>
                <div className="role-title">Staff Product Designer</div>
                <div className="role-tags-list">
                  <span className="tag-chip match">Figma</span>
                  <span className="tag-chip match">Design Systems</span>
                  <span className="tag-chip match">0→1 Products</span>
                  <span className="tag-chip">B2B SaaS</span>
                  <span className="tag-chip">Remote OK</span>
                </div>

                <div className="sidebar-metric-box">
                  <div className="metric-row"><span>Candidate Pool</span><b>96 verified</b></div>
                  <div className="metric-row"><span>Hard Exclusions</span><b>12 applied</b></div>
                  <div className="metric-row"><span>Ranking Mode</span><b>Evidence-weighted</b></div>
                </div>
              </div>

              <div className="dash-content">
                <div className="results-heading-row">
                  <span><strong>Ranked Shortlist</strong> (3 top matches)</span>
                  <span style={{ color: "var(--muted)", fontSize: "11.5px" }}>Click demo switch to test replay</span>
                </div>

                <div className="candidate-card-list">
                  {CANDIDATES.map((c, i) => (
                    <div className="candidate-mini-card" key={c.name}>
                      <div className="cand-person">
                        <img className="cand-img" src={c.img} alt={c.name} />
                        <div>
                          <div className="cand-name">{c.name}</div>
                          <div className="cand-sub">{c.role}</div>
                          <div className="cand-pills">
                            {c.tags.map(t => (
                              <span className="tag-chip match" key={t}>{t}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="cand-fit-score">
                        {[hero1, hero2, hero3][i]}%
                        <span>Fit Score</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 01 THE PROBLEM ─── */}
        <section className="section" id="problem">
          <div className="section-head">
            <div className="section-kicker">01 / The Problem</div>
            <h2 className="section-title">Hiring runs on the wrong inputs.</h2>
            <p className="section-desc">
              Candidates spend hours rewriting resumes to pass keyword filters. Recruiters read rehearsed bullet points rather than verified project evidence.
            </p>
          </div>

          <div className="problem-grid">
            <div className="p-card">
              <div className="p-tag">The Broken Loop</div>
              <h3>Apply. Reformat. Disappear.</h3>
              <p>Every job application demands a different format. Highly skilled builders get filtered out by naive text parsers before a human ever reviews their craft.</p>
              <div className="app-preview-strip">
                <div className="strip-row"><span>Application #184 · Staff Designer</span><span style={{ color: "var(--muted)" }}>Awaiting review</span></div>
                <div className="strip-row" style={{ opacity: 0.7 }}><span>Application #183 · Systems Lead</span><span style={{ color: "var(--amber)" }}>Filtered out</span></div>
                <div className="strip-row" style={{ opacity: 0.4 }}><span>Application #182 · Senior Designer</span><span style={{ color: "var(--muted)" }}>Unread</span></div>
              </div>
            </div>

            <div className="p-card highlight">
              <div className="p-tag">Tammy Engine</div>
              <h3>Prove it once. Match repeatedly.</h3>
              <p>One structured profile containing verifiable skills, actual project deliverables, and honest working styles becomes your single source of truth.</p>
              <div className="app-preview-strip">
                <div className="strip-row" style={{ background: "#fff" }}><span>Verified Craft Signals</span><b style={{ color: "var(--emerald)" }}>100% Extracted</b></div>
                <div className="strip-row" style={{ background: "#fff" }}><span>Candidate Context Match</span><b style={{ color: "var(--emerald)" }}>Transparent</b></div>
                <div className="strip-row" style={{ background: "#fff" }}><span>Direct Hiring Conversations</span><b style={{ color: "var(--emerald)" }}>Active</b></div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 02 PROFILE STUDIO ─── */}
        <section className="section" id="studio">
          <div className="section-head">
            <div className="section-kicker">02 / Profile Studio</div>
            <h2 className="section-title">Fill it in once. Watch it render.</h2>
            <p className="section-desc">
              Answer a few structured prompts about your projects and conditions. Click tags below to toggle skills live in your public card:
            </p>
          </div>

          <div className="studio-box">
            <div className="studio-controls">
              <label className="input-label">Role Title</label>
              <div className="text-input-mock">Senior Product Designer</div>

              <label className="input-label">Core Craft Strengths (Click to toggle)</label>
              <div className="interactive-chips-cloud">
                {STUDIO_CHIPS.map((chip, i) => (
                  <button
                    key={chip.label}
                    className={`chip-btn ${studioChips[i] ? "active" : ""}`}
                    onClick={() => toggleChip(i)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-preview">
              <div className="candidate-preview-hero">
                <div className="preview-id">
                  <img
                    className="preview-pic"
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&q=80"
                    alt="Maya"
                  />
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Maya Chen</h3>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>Product Designer · 6 Yrs Exp · Berlin</div>
                  </div>
                </div>
                <span className="tag-chip match" style={{ padding: "4px 10px" }}>Available Now</span>
              </div>

              <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6, marginBottom: 18 }}>
                Product designer dedicated to simplifying complicated architectures. Six years scaling B2B SaaS and early-stage platforms alongside engineering leads.
              </p>

              <label className="input-label">Live Active Profile Chips</label>
              <div className="interactive-chips-cloud">
                {STUDIO_CHIPS.map((chip, i) => (
                  studioChips[i] ? (
                    <span className="tag-chip match" key={chip.label}>{chip.label}</span>
                  ) : null
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── 03 MATCH ENGINE ─── */}
        <section className="section" id="matching">
          <div className="section-head">
            <div className="section-kicker">03 / Match Engine</div>
            <h2 className="section-title">The score explains itself.</h2>
            <p className="section-desc">
              No black-box algorithms. We apply filters as strict exclusions, then calculate candidate scores across four inspectable signals:
            </p>
          </div>

          <div className="engine-card">
            <div className="pipeline-progress-grid">
              {PIPELINE.map((s) => (
                <div className="p-stage-item" key={s.stage}>
                  <div className="p-stage-index">STAGE {s.stage} <span>{s.weight}</span></div>
                  <div className="p-stage-name">{s.name}</div>
                  <div className="p-stage-desc">{s.desc}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        background: s.color,
                        width: demoActive ? `${s.width}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="engine-match-details">
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Job Query Context</div>
                <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
                  Looking for a Staff Designer to oversee design tokens, component architecture, and customer workflow surfaces across our core web platform.
                </p>
              </div>
              <div>
                <div className="explanation-card">
                  <div className="exp-head"><span>Maya Chen</span><span style={{ color: "var(--emerald)" }}>94% Match</span></div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Built multi-brand token system · Shipped two 0→1 web applications.</div>
                </div>
                <div className="explanation-card">
                  <div className="exp-head"><span>Noah Williams</span><span style={{ color: "var(--emerald)" }}>89% Match</span></div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Strong design systems portfolio · 5 yrs fintech SaaS.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 04 SOURCING FLOW ─── */}
        <section className="section" id="desk">
          <div className="section-head">
            <div className="section-kicker">04 / Sourcing Workflow</div>
            <h2 className="section-title">Paste the role. Read the shortlist.</h2>
            <p className="section-desc">
              No complicated Boolean search queries. Just paste plain role requirements and review candidates ranked by evidence:
            </p>
          </div>

          <div className="flow-rail">
            {[
              { step: "01", title: "Paste Role", desc: "Drop your plain-text requirements into the desk." },
              { step: "02", title: "Detect Signals", desc: "Skills, seniority floors, and styles extracted live." },
              { step: "03", title: "Hard Exclusions", desc: "Missing non-negotiables are excluded immediately." },
              { step: "04", title: "Rank Evidence", desc: "Inspectable breakdown of overlaps and missing items." },
              { step: "05", title: "Export & Connect", desc: "Shortlist candidates to drawer and reach out with context." },
            ].map((f) => (
              <div className="flow-col" key={f.step}>
                <span className="flow-step-num">STEP {f.step}</span>
                <h4>{f.title}</h4>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── 05 DOSSIER ─── */}
        <section className="section">
          <div className="section-head">
            <div className="section-kicker">05 / The Shortlist Output</div>
            <h2 className="section-title">The first call starts with context.</h2>
            <p className="section-desc">
              Every profile breakdown shows exact skill intersections, verified achievements, and potential trade-offs before your first conversation:
            </p>
          </div>

          <div className="dossier-card">
            <div className="dossier-sidebar">
              <div className="radial-gauge-row">
                <div className="svg-ring-container">
                  <svg viewBox="0 0 60 60">
                    <circle className="track" cx="30" cy="30" r="26" />
                    <circle className="fill" cx="30" cy="30" r="26" style={{ strokeDashoffset: ringOffset }} />
                  </svg>
                  <div className="ring-score-text">{dossierScore}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Fit Score</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>Rank #1 of 96</div>
                </div>
              </div>

              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Maya Chen</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>Staff Product Designer · Berlin</div>
              <div style={{ fontSize: 11.5, color: "var(--body)", lineHeight: 1.5 }}>Available Immediately · Remote OK · 6 Years Experience</div>
            </div>

            <div className="dossier-main">
              <div className="evidence-item">
                <div className="evidence-top"><span>Matched Core Signals</span><span className="tag-chip match">Verified Match</span></div>
                <p>Directly verified craft experience: Figma design system management, 0→1 platform releases, user research protocols.</p>
              </div>
              <div className="evidence-item">
                <div className="evidence-top"><span>Areas to Explore</span><span style={{ fontSize: 11, color: "var(--amber)", fontWeight: 600 }}>Trade-off</span></div>
                <p>Primarily specialized in complex desktop web workflow tools rather than native mobile consumer design.</p>
              </div>
              <div className="evidence-item">
                <div className="evidence-top"><span>Why Ranked #1</span><span style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600 }}>Score: 94 / 100</span></div>
                <p>Top decile in craft relevance, 6 years experience against a 5-year floor, and immediate start availability.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 06 TRUST ─── */}
        <section className="section" style={{ borderBottom: "none" }}>
          <div className="section-head">
            <div className="section-kicker">06 / Trust & Control</div>
            <h2 className="section-title">Publishing requires protection.</h2>
            <p className="section-desc">
              Candidates only share honest details when they control visibility. We built these principles directly into the platform:
            </p>
          </div>

          <div className="trust-grid">
            <div className="trust-card">
              <div className="trust-icon">🔒</div>
              <h4>Private by Default</h4>
              <p>No public searchable directory. Profiles are discoverable solely through targeted recruiter searches.</p>
            </div>
            <div className="trust-card">
              <div className="trust-icon">⚡️</div>
              <h4>Instant Revocation</h4>
              <p>Unpublish or delete your profile at any time. Changes propagate across recruiter indexes immediately.</p>
            </div>
            <div className="trust-card">
              <div className="trust-icon">📊</div>
              <h4>Transparent Scoring</h4>
              <p>Every match score shows what counted and what was missing. If a factor cannot be justified, it isn&apos;t scored.</p>
            </div>
          </div>
        </section>

        {/* ─── QUOTE ─── */}
        <div className="quote-banner">
          <div className="quote-text">&ldquo;A candidate should look like a person before they look like an application.&rdquo;</div>
          <div className="quote-sub">Living profiles for individuals. True context for recruiters. One shared layer.</div>
        </div>

        {/* ─── FINAL CTA ─── */}
        <section className="final-cta">
          <h2>Give talent a better first impression.</h2>
          <p>Build your profile once and let verified matches come to you. Or bring your open role and find the people already doing the work.</p>
          <div className="hero-actions">
            <a href="#studio" className="btn btn-emerald btn-lg">Create candidate profile ↗</a>
            <a href="#matching" className="btn btn-outline btn-lg">Open sourcing desk</a>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer>
        <div className="page footer-inner">
          <span>© 2026 Tammy Systems Inc. All rights reserved.</span>
          <div className="footer-links">
            <a href="#studio">For Candidates</a>
            <a href="#desk">For Hiring Teams</a>
            <a href="#matching">Match Engine</a>
          </div>
        </div>
      </footer>
    </>
  )
}
